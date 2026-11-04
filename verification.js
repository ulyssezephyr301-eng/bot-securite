// Vérification des comptes Roblox : le compte existe, appartient bien au membre, puis le membre est renommé.
// En jeu : un compte non vérifié (ou dont le propriétaire a quitté le serveur principal) est prévenu puis expulsé.
const { randomInt } = require('crypto');
const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const base = require('./database');
const erlc = require('./erlc');
const { profilRoblox, avatarRoblox } = require('./roblox');
const { COULEURS, envoyerLog, envoyerSanctionLog } = require('./utils');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I pour éviter les confusions
const enAttente = new Map(); // discordId -> { robloxId, nom, code, expire }

const principal = (client) => client.guilds.cache.get(config.ERLC.GUILD_ID) ?? null;

/* ---------- Preuve de propriété : un code dans la description du profil Roblox ---------- */
function genererCode() {
  let c = 'BXL-';
  for (let k = 0; k < 6; k++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

function preparer(discordId, compte) {
  const code = genererCode();
  enAttente.set(discordId, {
    robloxId: String(compte.id), nom: compte.nom, code,
    expire: Date.now() + config.VERIF.codeValiditeMin * 60_000,
  });
  return code;
}

async function controlerCode(discordId) {
  const p = enAttente.get(discordId);
  if (!p || p.expire < Date.now()) {
    enAttente.delete(discordId);
    return { ok: false, erreur: 'Ta demande a expiré : clique de nouveau sur « Se vérifier ».' };
  }
  const profil = await profilRoblox(p.robloxId);
  if (!profil) return { ok: false, erreur: 'Impossible de lire ton profil Roblox pour le moment : réessaie dans quelques instants.' };
  if (!String(profil.description ?? '').toUpperCase().includes(p.code)) {
    return { ok: false, erreur: `Je ne trouve pas le code **${p.code}** dans la description de **${p.nom}**. Vérifie qu'il est bien enregistré (la mise à jour peut prendre quelques secondes), puis clique de nouveau.` };
  }
  enAttente.delete(discordId);
  return { ok: true, compte: { id: p.robloxId, nom: profil.name ?? p.nom } };
}

/* ---------- Rôles du serveur principal ---------- */
// Nouveau membre : rôle « non vérifié ». Vérification faite : il le perd et reçoit « sans papier ».
async function passerNonVerifie(membre, raison = 'Vérification à faire') {
  const { roleNonVerifie, roleSansPapier } = config.VERIF;
  let ok = true;
  if (roleNonVerifie) { try { await membre.roles.add(roleNonVerifie, raison); } catch { ok = false; } }
  if (roleSansPapier) { try { await membre.roles.remove(roleSansPapier, raison); } catch { ok = false; } }
  return ok;
}

async function passerVerifie(membre, raison = 'Vérification Roblox') {
  const { roleNonVerifie, roleSansPapier } = config.VERIF;
  let ok = true;
  if (roleNonVerifie) { try { await membre.roles.remove(roleNonVerifie, raison); } catch { ok = false; } }
  if (roleSansPapier) { try { await membre.roles.add(roleSansPapier, raison); } catch { ok = false; } }
  return ok;
}

/* ---------- Annonce de chaque vérification ---------- */
async function annoncer(guild, membre, compte, { ancienPseudo, methode, renomme }) {
  const avatar = await avatarRoblox(compte.id);
  const maintenant = Math.floor(Date.now() / 1000);
  const username = membre.user?.username;
  const embed = new EmbedBuilder().setColor(COULEURS.unmute)
    .setTitle('✅ Vérification effectuée')
    .setDescription(`Le membre <@${membre.id}> a fait sa vérification.`)
    .addFields(
      { name: 'Ancien pseudo Discord', value: `${ancienPseudo}${username && username !== ancienPseudo ? ` (@${username})` : ''}`.slice(0, 200), inline: true },
      { name: 'ID Discord', value: `\`${membre.id}\``, inline: true },
      { name: 'Nouveau pseudo', value: renomme ? compte.nom : '⚠️ non renommé (rôle du bot trop bas ?)', inline: true },
      { name: 'Compte Roblox', value: `[${compte.nom}](https://www.roblox.com/users/${compte.id}/profile)`, inline: true },
      { name: 'ID Roblox', value: `\`${compte.id}\``, inline: true },
      { name: 'Méthode', value: methode === 'oauth' ? 'Connexion Roblox (OAuth)' : 'Code dans la description', inline: true },
      { name: 'Vérifié', value: `<t:${maintenant}:F> (<t:${maintenant}:R>)` },
    ).setTimestamp();
  if (avatar) embed.setThumbnail(avatar);

  const id = config.VERIF.salonVerifications;
  const salon = id ? (guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null))) : null;
  if (salon?.isTextBased()) {
    await salon.send({ content: `<@${membre.id}>`, embeds: [embed], allowedMentions: { users: [membre.id] } }).catch(() => {});
    return true;
  }
  await envoyerLog(guild, embed); // salon introuvable : repli sur les logs
  return false;
}

/* ---------- Enregistrement : liaison, renommage, rôles, annonce ---------- */
async function finaliser(guild, membre, compte, methode = 'code') {
  const ancienPseudo = membre.nickname ?? membre.user?.globalName ?? membre.user?.username ?? String(membre.id);
  await base.setVerification({ discordId: membre.id, robloxId: String(compte.id), robloxName: compte.nom });
  await base.setLienRoblox(membre.id, String(compte.id), compte.nom).catch(() => {});

  let renomme = true;
  try { await membre.setNickname(compte.nom, 'Vérification Roblox'); } catch { renomme = false; }
  const roles = await passerVerifie(membre);
  await annoncer(guild, membre, compte, { ancienPseudo, methode, renomme });
  return { renomme, roles };
}

/* ---------- Contrôle des joueurs en jeu ---------- */
// Vérifié = compte lié à un membre qui est TOUJOURS sur le serveur principal
async function estVerifie(main, robloxId) {
  const v = await base.getVerificationParRoblox(robloxId);
  if (!v) return false;
  if (main.members.cache.has(v.discord_id)) return true;
  try {
    await main.members.fetch(v.discord_id);
    return true;
  } catch (err) {
    return err.code === 10007 ? false : true; // erreur inconnue : jamais d'expulsion à tort
  }
}

// Joueurs en jeu à contrôler (le propriétaire, les co-propriétaires et le staff en jeu sont exemptés)
async function evaluerJoueurs(client) {
  const main = principal(client);
  if (!main || !erlc.configure()) return null;
  const d = await erlc.serveur({ players: true }, { ttlMs: 8000, timeoutMs: 6000 });
  const exemptes = new Set([String(d.OwnerId), ...(d.CoOwnerIds ?? []).map(String), ...config.VERIF.kickJeu.idsRobloxExemptes.map(String)]);
  const joueurs = (d.Players ?? []).map(erlc.parseJoueur).filter(j => j.id && j.permission === 'Normal' && !exemptes.has(j.id));
  const nonVerifies = [];
  for (const j of joueurs) if (!(await estVerifie(main, j.id))) nonVerifies.push(j);
  return { main, total: joueurs.length, nonVerifies };
}

const avertis = new Map(); // robloxId -> { t, nom }
let enCours = false;
let derniereAlerte = 0;

async function controlerJoueurs(client) {
  if (enCours) return null;
  enCours = true;
  const cfg = config.VERIF.kickJeu;
  const resume = { prevenus: 0, expulses: 0, nonVerifies: 0 };
  try {
    const main = principal(client);
    if (!main) return resume;
    if ((await base.getSetting(main.id, 'verification_jeu')) !== 'on') { avertis.clear(); return resume; }
    if ((await base.countVerifications()) === 0) return resume; // sécurité : jamais d'expulsion en masse avec une liste vide

    let eval_;
    try { eval_ = await evaluerJoueurs(client); } catch { return resume; }
    if (!eval_) return resume;

    const presents = new Set(eval_.nonVerifies.map(j => j.id));
    for (const id of [...avertis.keys()]) if (!presents.has(id)) avertis.delete(id); // vérifié ou parti
    resume.nonVerifies = eval_.nonVerifies.length;

    let kicks = 0;
    for (const j of eval_.nonVerifies) {
      const nom = erlc.validerJoueur(j.nom);
      if (!nom) continue;
      const vu = avertis.get(j.id);
      try {
        if (!vu) {
          avertis.set(j.id, { t: Date.now(), nom });
          await erlc.envoyerCommande(`:pm ${nom} ${erlc.nettoyerMessage(`Compte Roblox non vérifié : rejoins le Discord ${main.name} et vérifie-toi, sinon tu seras expulsé dans ${cfg.delaiAvantKickSec} s.`)}`);
          resume.prevenus++;
        } else if (Date.now() - vu.t >= cfg.delaiAvantKickSec * 1000 && kicks < cfg.maxKicksParCycle) {
          await erlc.envoyerCommande(`:kick ${nom}`);
          kicks++;
          resume.expulses++;
          avertis.delete(j.id);
          await envoyerSanctionLog(main, new EmbedBuilder().setColor(COULEURS.kick)
            .setTitle('🎮 Expulsion en jeu : compte non vérifié')
            .addFields(
              { name: 'Compte Roblox', value: `[${nom}](https://www.roblox.com/users/${j.id}/profile) (\`${j.id}\`)`, inline: true },
              { name: 'Raison', value: 'Compte non vérifié, ou propriétaire absent du serveur principal', inline: true },
            ).setTimestamp());
        }
      } catch (err) {
        if (Date.now() - derniereAlerte > 30 * 60_000) {
          derniereAlerte = Date.now();
          await envoyerLog(main, new EmbedBuilder().setColor(COULEURS.alerte)
            .setTitle('🚨 Contrôle des comptes en jeu impossible')
            .setDescription(`Je ne peux pas envoyer de commande à ER:LC : ${err.message}`).setTimestamp(), true);
        }
        break;
      }
    }
    return resume;
  } finally {
    enCours = false;
  }
}

module.exports = {
  preparer, controlerCode, finaliser, passerVerifie, passerNonVerifie, estVerifie, evaluerJoueurs, controlerJoueurs,
  _enAttente: enAttente,
};
