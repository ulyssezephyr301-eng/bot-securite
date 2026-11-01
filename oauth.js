// Connexion « Se connecter avec Roblox » (OAuth 2.0 / OpenID Connect) + petit serveur web du bot.
// Le bot ne reçoit jamais le mot de passe du joueur : Roblox renvoie seulement l'identifiant du compte.
const { randomBytes } = require('crypto');
const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const base = require('./database');
const verification = require('./verification');
const { profilRoblox } = require('./roblox');
const { COULEURS } = require('./utils');

const AUTORISER = 'https://apis.roblox.com/oauth/v1/authorize';
const TOKEN = 'https://apis.roblox.com/oauth/v1/token';
const USERINFO = 'https://apis.roblox.com/oauth/v1/userinfo';
const REVOQUER = 'https://apis.roblox.com/oauth/v1/token/revoke';

const urlPublique = () => String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const urlRedirection = () => `${urlPublique()}/oauth/roblox/callback`;

// La connexion Roblox demande un identifiant d'app, son secret et une adresse publique en HTTPS
const configure = () => Boolean(process.env.ROBLOX_CLIENT_ID && process.env.ROBLOX_CLIENT_SECRET && urlPublique().startsWith('https://'));
const mode = () => (configure() && config.VERIF.mode !== 'code' ? 'oauth' : 'code');

/* ---------- Étapes de la connexion ---------- */
async function lienAutorisation(discordId) {
  await base.purgeOauthAttente(Date.now());
  const state = randomBytes(24).toString('base64url'); // anti-falsification : lié à ce membre, usage unique
  await base.addOauthAttente(state, discordId, Date.now() + config.VERIF.oauthValiditeMin * 60_000);
  const p = new URLSearchParams({
    client_id: process.env.ROBLOX_CLIENT_ID,
    redirect_uri: urlRedirection(),
    scope: 'openid profile',
    response_type: 'code',
    state,
  });
  return `${AUTORISER}?${p.toString().replace(/\+/g, '%20')}`;
}

async function echangerCode(code) {
  const corps = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.ROBLOX_CLIENT_ID,
    client_secret: process.env.ROBLOX_CLIENT_SECRET,
    redirect_uri: urlRedirection(),
  });
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) throw new Error(`échange du code refusé (HTTP ${res.status}${data?.error ? `, ${data.error}` : ''})`);
  return data;
}

async function infosUtilisateur(accessToken) {
  const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.sub) throw new Error(`informations du compte indisponibles (HTTP ${res.status})`);
  return data;
}

// Le bot ne garde aucun jeton : on les révoque dès qu'on a l'identifiant du compte
async function revoquer(tokens) {
  const jeton = tokens.refresh_token ?? tokens.access_token;
  if (!jeton) return;
  try {
    await fetch(REVOQUER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: jeton, client_id: process.env.ROBLOX_CLIENT_ID, client_secret: process.env.ROBLOX_CLIENT_SECRET }).toString(),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* sans importance */ }
}

const echec = (titre, message) => ({ ok: false, titre, message });
const RETOUR = 'Retourne sur Discord et clique de nouveau sur « Se vérifier ».';

async function traiterCallback(client, params) {
  if (params.get('error')) return echec('Autorisation refusée', `La connexion a été refusée ou a échoué. ${RETOUR}`);
  const state = params.get('state');
  const code = params.get('code');
  if (!state || !code) return echec('Lien invalide', RETOUR);

  const attente = await base.takeOauthAttente(state);
  if (!attente || Number(attente.expire) < Date.now()) {
    return echec('Lien expiré', `Ce lien n'est plus valable (usage unique, ${config.VERIF.oauthValiditeMin} minutes maximum). ${RETOUR}`);
  }

  let tokens;
  let infos;
  try {
    tokens = await echangerCode(code);
    infos = await infosUtilisateur(tokens.access_token);
  } catch (err) {
    console.error('Connexion Roblox impossible :', err.message);
    return echec('Connexion impossible', "Roblox n'a pas confirmé ta connexion. Réessaie dans quelques instants.");
  }
  await revoquer(tokens);

  const robloxId = String(infos.sub);
  let nom = String(infos.preferred_username ?? '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(nom)) nom = String((await profilRoblox(robloxId))?.name ?? '');
  if (!/^\d+$/.test(robloxId) || !/^[A-Za-z0-9_]{3,20}$/.test(nom)) return echec('Compte illisible', "Je n'ai pas pu lire le pseudo de ton compte Roblox. Réessaie plus tard.");

  const main = client.guilds.cache.get(config.ERLC.GUILD_ID);
  if (!main) return echec('Serveur introuvable', 'Le serveur principal est momentanément introuvable. Réessaie plus tard.');
  let membre;
  try {
    membre = await main.members.fetch(attente.discord_id);
  } catch {
    return echec('Serveur principal', "Tu n'es pas (ou plus) membre du serveur principal : rejoins-le, puis recommence.");
  }

  const deja = await base.getVerificationParRoblox(robloxId);
  if (deja && deja.discord_id !== attente.discord_id) {
    return echec('Compte déjà utilisé', "Ce compte Roblox est déjà vérifié par un autre membre. Si c'est bien le tien, contacte le staff.");
  }

  let res;
  try {
    res = await verification.finaliser(main, membre, { id: robloxId, nom });
  } catch (err) {
    console.error('Enregistrement de la vérification impossible :', err.message);
    return echec('Enregistrement impossible', 'Réessaie dans quelques instants.');
  }

  // Petit MP de confirmation (facultatif)
  await membre.send({
    embeds: [new EmbedBuilder().setColor(COULEURS.unmute).setTitle('✅ Compte Roblox vérifié')
      .setDescription(`Ton compte **${nom}** est lié à ton compte Discord.${res.renomme ? ` Ton pseudo est maintenant **${nom}**.` : ` Change ton pseudo Discord en **${nom}**.`}`)],
  }).catch(() => {});

  return { ok: true, titre: 'Compte vérifié', message: `Ton compte Roblox ${nom} est vérifié. Tu peux fermer cette page et retourner sur Discord.` };
}

/* ---------- Pages web ---------- */
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(titre, corpsHtml) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(titre)}</title>
<style>body{font-family:system-ui,sans-serif;background:#1e1f22;color:#f2f3f5;display:flex;justify-content:center;padding:2rem}main{max-width:640px;background:#2b2d31;padding:2rem;border-radius:12px;line-height:1.5}h1{margin-top:0}footer{margin-top:2rem;font-size:.85rem;color:#b5bac1}a{color:#8ab4f8}</style>
</head><body><main><h1>${echapper(titre)}</h1>${corpsHtml}<footer>Dev by U-lis ⚜</footer></main></body></html>`;
}

const pageResultat = (r) => page(`${r.ok ? '✅' : '❌'} ${r.titre}`, `<p>${echapper(r.message)}</p>`);

const PAGE_CONFIDENTIALITE = page('Politique de confidentialité', `
<p>Ce bot Discord sert à la modération des serveurs Bruxelles RP et de leur serveur ER:LC.</p>
<h2>Données utilisées</h2>
<ul><li>Ton identifiant et ton pseudo Roblox, fournis par Roblox quand tu autorises la connexion (autorisations « openid » et « profile »).</li>
<li>Ton identifiant Discord, pour lier ton compte Discord à ton compte Roblox.</li></ul>
<h2>Ce que nous ne faisons pas</h2>
<ul><li>Nous ne recevons jamais ton mot de passe Roblox.</li><li>Nous ne conservons aucun jeton d'accès : ils sont révoqués dès que ton identifiant est lu.</li>
<li>Nous ne vendons ni ne partageons ces données.</li></ul>
<h2>Utilisation et conservation</h2>
<p>Ces données servent à vérifier ton compte, à te renommer sur Discord, à appliquer les sanctions (y compris en jeu) et à refuser l'accès au jeu aux comptes non vérifiés. Elles sont conservées tant que tu es membre du serveur.</p>
<h2>Tes droits</h2>
<p>Tu peux demander au staff du serveur de supprimer ta vérification à tout moment. Tu peux aussi retirer l'autorisation donnée à l'application dans les réglages de ton compte Roblox.</p>`);

const PAGE_CONDITIONS = page("Conditions d'utilisation", `
<p>La vérification Roblox est réservée aux membres des serveurs Bruxelles RP.</p>
<ul><li>Tu ne peux lier que ton propre compte Roblox, et un compte Roblox ne peut être lié qu'à un seul membre.</li>
<li>Les comptes non vérifiés peuvent être refusés sur le serveur ER:LC.</li>
<li>Le staff peut retirer une vérification en cas d'abus. Les sanctions du réseau s'appliquent à tous les serveurs.</li>
<li>Le service est fourni tel quel, sans garantie de disponibilité.</li></ul>`);

/* ---------- Serveur web ---------- */
const appels = new Map(); // ip -> horodatages (limite : 20 retours par minute)
function tropDeRequetes(ip) {
  const now = Date.now();
  const liste = (appels.get(ip) ?? []).filter(t => now - t < 60_000);
  liste.push(now);
  appels.set(ip, liste);
  if (appels.size > 5000) appels.clear();
  return liste.length > 20;
}

async function gerer(req, res, client) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const commun = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const html = { ...commun, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" };
  const lecture = req.method === 'GET' || req.method === 'HEAD';

  if (lecture && url.pathname === '/oauth/roblox/callback') {
    const ip = String(req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '?').split(',')[0].trim();
    if (tropDeRequetes(ip)) { res.writeHead(429, html); return res.end(pageResultat(echec('Trop de tentatives', 'Patiente une minute puis réessaie.'))); }
    const r = await traiterCallback(client, url.searchParams);
    res.writeHead(r.ok ? 200 : 400, html);
    return res.end(pageResultat(r));
  }
  if (lecture && url.pathname === '/confidentialite') { res.writeHead(200, html); return res.end(PAGE_CONFIDENTIALITE); }
  if (lecture && url.pathname === '/conditions') { res.writeHead(200, html); return res.end(PAGE_CONDITIONS); }
  if (lecture && (url.pathname === '/' || url.pathname === '/health')) { res.writeHead(200, { ...commun, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bot en ligne'); }
  res.writeHead(404, { ...commun, 'Content-Type': 'text/plain; charset=utf-8' });
  return res.end('Introuvable');
}

module.exports = { configure, mode, urlRedirection, urlPublique, lienAutorisation, traiterCallback, gerer };
