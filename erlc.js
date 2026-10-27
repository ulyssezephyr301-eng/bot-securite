// Liaison avec l'API ER:LC (PRC). La clé est lue dans la variable d'environnement ERLC_API_KEY : jamais dans le code.
const config = require('./config');
const base = require('./database');
const { trouverCompteRoblox } = require('./roblox');

const BASE = 'https://api.policeroleplay.community';

class ErlcError extends Error {
  constructor(message, { status = null, vide = false, details = null } = {}) {
    super(message);
    this.name = 'ErlcError';
    this.status = status;
    this.vide = vide;       // le serveur ER:LC est vide : l'API refuse les commandes
    this.details = details;
  }
}

const configure = () => Boolean(process.env.ERLC_API_KEY);

function interpreterErreur(status, data) {
  const brut = String(data?.message ?? data?.error ?? '').slice(0, 200);
  if (/no players/i.test(brut)) {
    return { texte: "Le serveur ER:LC est vide : l'API refuse d'envoyer des commandes quand personne n'est en jeu.", vide: true };
  }
  if (status === 401 || status === 403) {
    return { texte: 'La clé API ER:LC est refusée (vérifie la variable ERLC_API_KEY sur Render).' };
  }
  if (status === 429) {
    const s = Math.ceil(Number(data?.retry_after) || 5);
    return { texte: `Trop de requêtes vers l'API ER:LC : réessaie dans ${s} s.` };
  }
  if (Number(data?.code) === 4000 || /\btrusted\b/i.test(brut)) {
    return { texte: "ER:LC refuse la commande : l'adresse IP du bot n'est pas reconnue comme source de confiance (voir les réglages API du serveur ER:LC)." };
  }
  if (status >= 500) return { texte: "L'API ER:LC est indisponible pour le moment." };
  return { texte: `L'API ER:LC a répondu par une erreur${status ? ` (${status})` : ''}${brut ? ` : ${brut}` : ''}.` };
}

async function requete(chemin, { method = 'GET', body = null, timeoutMs = 10_000 } = {}) {
  const cle = process.env.ERLC_API_KEY;
  if (!cle) throw new ErlcError("La clé API ER:LC n'est pas configurée (variable ERLC_API_KEY sur Render).");
  let res;
  try {
    res = await fetch(BASE + chemin, {
      method,
      headers: { 'server-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ErlcError("Impossible de joindre l'API ER:LC (délai dépassé ou réseau).");
  }
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const m = interpreterErreur(res.status, data);
    throw new ErlcError(m.texte, { status: res.status, vide: Boolean(m.vide), details: data });
  }
  return data;
}

/* ---------- Lecture (avec un petit cache pour ménager l'API) ---------- */
const cache = new Map();

async function serveur({ players = false, staff = false, queue = false } = {}, { ttlMs = 10_000, timeoutMs } = {}) {
  const params = [players && 'Players=true', staff && 'Staff=true', queue && 'Queue=true'].filter(Boolean);
  const chemin = `/v2/server${params.length ? `?${params.join('&')}` : ''}`;
  const c = cache.get(chemin);
  if (c && Date.now() - c.t < ttlMs) return c.data;
  const data = await requete(chemin, { timeoutMs });
  cache.set(chemin, { t: Date.now(), data });
  return data;
}

function viderCache() {
  cache.clear();
}

async function nombreJoueurs() {
  const d = await serveur({}, { ttlMs: 10_000, timeoutMs: 5000 });
  return Number(d?.CurrentPlayers ?? 0);
}

// "Pseudo:123456" -> { nom, id, ... }
function parseJoueur(p) {
  const [nom, id] = String(p?.Player ?? '').split(':');
  return { nom: nom || '?', id: id || null, permission: p?.Permission ?? 'Normal', equipe: p?.Team ?? 'Inconnue', indicatif: p?.Callsign ?? null };
}

/* ---------- Commandes (une toutes les ~5 s, en file d'attente) ---------- */
let derniereCommande = 0;
let chaine = Promise.resolve();

function envoyerCommande(commande) {
  const tache = chaine.then(async () => {
    const attente = Math.max(0, derniereCommande + config.ERLC.intervalleCommandesMs - Date.now());
    if (attente) await new Promise(r => setTimeout(r, attente));
    try {
      return await requete('/v2/server/command', { method: 'POST', body: { command: commande } });
    } finally {
      derniereCommande = Date.now();
    }
  });
  chaine = tache.catch(() => {});
  return tache;
}

// Si le serveur est vide, l'API refuse les commandes : on les garde en attente (ban / unban uniquement)
async function executerOuAttendre(guild, commande, description) {
  try {
    await envoyerCommande(commande);
    return 'envoye';
  } catch (err) {
    if (err instanceof ErlcError && err.vide) {
      await base.addAttenteJeu({ guildId: guild.id, commande, description });
      return 'attente';
    }
    throw err;
  }
}

async function traiterAttente() {
  const lignes = await base.getAttenteJeu(5);
  if (!lignes.length) return [];
  let joueurs;
  try { joueurs = await nombreJoueurs(); } catch { return []; }
  if (!joueurs) return [];

  const faits = [];
  for (const l of lignes) {
    try {
      await envoyerCommande(l.commande);
      await base.deleteAttenteJeu(l.id);
      faits.push(l);
    } catch (err) {
      if (err instanceof ErlcError && err.vide) break;
      await base.incrAttenteJeu(l.id);
      if (Number(l.essais) + 1 >= 10) {
        await base.deleteAttenteJeu(l.id);
        faits.push({ ...l, echec: err.message });
      }
    }
  }
  return faits;
}

/* ---------- Validation des saisies (évite d'injecter une autre commande) ---------- */
function validerJoueur(txt) {
  const t = String(txt ?? '').trim();
  if (/^[A-Za-z0-9_]{3,20}$/.test(t) || /^\d{3,15}$/.test(t)) return t;
  return null;
}

function nettoyerMessage(txt, max = 200) {
  return String(txt ?? '').replace(/[\r\n\t\u0000-\u001f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

function normaliserCommande(txt) {
  const t = nettoyerMessage(txt, 200).replace(/^:+/, '').trim();
  return t ? `:${t}` : '';
}

function commandeBloquee(commande) {
  const nom = commande.replace(/^:+/, '').trim().split(/\s+/)[0]?.toLowerCase();
  return config.ERLC.commandesBloquees.includes(nom);
}

/* ---------- Ban / unban Discord -> ban / unban en jeu ---------- */
const applicable = (guild) => guild.id === config.ERLC.GUILD_ID;

async function memoriser(userId, compte) {
  if (!userId || !compte?.nom || /^\d+$/.test(String(compte.nom))) return;
  await base.setLienRoblox(userId, String(compte.id), compte.nom).catch(() => {});
}

// Retrouve le compte Roblox : pseudo saisi, sinon pseudo Bloxlink du membre, sinon compte déjà connu
async function resoudreRoblox({ userId, membre, pseudo }) {
  if (pseudo) {
    const txt = pseudo.trim();
    if (/^\d{3,15}$/.test(txt)) return { id: txt, nom: txt };
    const compte = await trouverCompteRoblox(txt);
    if (compte) { await memoriser(userId, compte); return compte; }
    return null;
  }
  if (membre) {
    const compte = await trouverCompteRoblox(membre.nickname ?? membre.user.username);
    if (compte) { await memoriser(userId, compte); return compte; }
  }
  const lien = userId ? await base.getLienRoblox(userId).catch(() => null) : null;
  return lien ? { id: lien.roblox_id, nom: lien.roblox_name } : null;
}

async function synchroniser(guild, commandeAvec, description, { userId, membre, pseudo }) {
  if (!applicable(guild)) return null;
  if (!configure()) return { etat: 'echec', pseudo: null, erreur: "API ER:LC non configurée (variable ERLC_API_KEY sur Render)." };
  const compte = await resoudreRoblox({ userId, membre, pseudo });
  if (!compte) {
    return { etat: 'echec', pseudo: null, erreur: "compte Roblox introuvable (son pseudo Discord n'est pas un pseudo Roblox valide) : utilise l'option roblox." };
  }
  try {
    const etat = await executerOuAttendre(guild, commandeAvec(compte.nom), `${description} ${compte.nom}`);
    return { etat, pseudo: compte.nom };
  } catch (err) {
    return { etat: 'echec', pseudo: compte.nom, erreur: err instanceof ErlcError ? err.message : 'erreur inattendue' };
  }
}

const synchroniserBan = (guild, params) => synchroniser(guild, (n) => `:ban ${n}`, 'Ban en jeu de', params);
const synchroniserUnban = (guild, params) => synchroniser(guild, (n) => `:unban ${n}`, 'Unban en jeu de', params);

module.exports = {
  ErlcError, configure, serveur, viderCache, nombreJoueurs, parseJoueur,
  envoyerCommande, executerOuAttendre, traiterAttente,
  validerJoueur, nettoyerMessage, normaliserCommande, commandeBloquee,
  synchroniserBan, synchroniserUnban,
};
