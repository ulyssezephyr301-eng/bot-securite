const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('./config');
const base = require('./database');

// ✍️ Signature : ajoute « U-lis » en bas de CHAQUE embed envoyé par le bot
const SIGNATURE = 'Dev by U-lis ⚜';
const toJSONOriginal = EmbedBuilder.prototype.toJSON;
EmbedBuilder.prototype.toJSON = function () {
  const data = toJSONOriginal.call(this);
  const texte = data.footer?.text;
  if (!texte) data.footer = { ...(data.footer ?? {}), text: SIGNATURE };
  else if (!texte.includes(SIGNATURE)) data.footer = { ...data.footer, text: `${texte} • ${SIGNATURE}` };
  return data;
};

const EPH = { flags: MessageFlags.Ephemeral };
const LABELS = { warn: 'Avertissement', mute: 'Mute', kick: 'Expulsion', ban: 'Bannissement' };
const COULEURS = {
  warn: 0xf1c40f, mute: 0xe67e22, kick: 0xe74c3c, ban: 0x992d22,
  unmute: 0x2ecc71, unban: 0x2ecc71, info: 0x3498db, alerte: 0xc0392b,
};
const UNITES = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** "30m", "2h", "7d", "1w" -> millisecondes (ou null si invalide) */
function parseDuree(txt) {
  if (!txt) return null;
  const m = /^(\d+)\s*([smhdw])$/i.exec(String(txt).trim());
  if (!m) return null;
  return parseInt(m[1], 10) * UNITES[m[2].toLowerCase()];
}

function formatDuree(ms) {
  const j = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const parts = [];
  if (j) parts.push(`${j} j`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s && !j && !h) parts.push(`${s} s`);
  return parts.join(' ') || '0 s';
}

/** Grade du staff : 0 = aucun, 1 = Guide ... 5 = Fondateur (propriétaire du serveur = 5) */
function niveau(member) {
  if (!member) return 0;
  if (member.guild.ownerId === member.id || config.SUPER_UTILISATEURS.includes(member.id)) return 5;
  let n = 0;
  for (const [lvl, ids] of Object.entries(config.ROLES_NIVEAUX)) {
    if (member.roles.cache.some(r => ids.includes(r.id))) n = Math.max(n, Number(lvl));
  }
  return n;
}

/** Le membre a-t-il le droit d'utiliser cette action ? (voir NIVEAU_MIN dans config.js) */
function peut(member, action) {
  return niveau(member) >= (config.NIVEAU_MIN[action] ?? 99);
}

function dureeMuteMax(member) {
  return Math.min(config.MUTE_MAX_PAR_NIVEAU[niveau(member)] ?? 0, config.MUTE_MAX_MS);
}

function estExempte(member) {
  return niveau(member) >= 1 || member.roles.cache.some(r => config.EXEMPT_ROLES.includes(r.id));
}

async function salonConfigure(guild, cle, defaut) {
  const id = (await base.getSetting(guild.id, cle)) || defaut;
  if (!id) return null;
  const salon = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
  return salon && salon.isTextBased() ? salon : null;
}

async function envoyerLog(guild, embed) {
  const salon = await salonConfigure(guild, 'logs_channel', config.LOG_CHANNEL_ID);
  if (salon) await salon.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Applique une sanction (warn / mute / kick / ban), l'enregistre, prévient le joueur et logue.
 * Renvoie { ok, id, palier } ou { ok:false, erreur }.
 */
async function appliquerSanction({ guild, cibleId, moderateur, type, raison, dureeMs = null, auto = false }) {
  const botMembre = guild.members.me;
  const membre = await guild.members.fetch(cibleId).catch(() => null);
  const modMembre = auto ? null : await guild.members.fetch(moderateur.id).catch(() => null);

  if (cibleId === moderateur.id) return { ok: false, erreur: 'Tu ne peux pas te sanctionner toi-même.' };
  if (cibleId === guild.client.user.id) return { ok: false, erreur: 'Je ne peux pas me sanctionner moi-même.' };
  if (cibleId === guild.ownerId) return { ok: false, erreur: 'Impossible de sanctionner le propriétaire du serveur.' };
  if (!membre && (type === 'mute' || type === 'kick')) return { ok: false, erreur: "Ce joueur n'est pas sur le serveur." };

  if (membre && modMembre && modMembre.id !== guild.ownerId && !config.SUPER_UTILISATEURS.includes(modMembre.id)) {
    const nCible = niveau(membre);
    if (nCible > 0 && nCible >= niveau(modMembre)) {
      return { ok: false, erreur: 'Ce joueur est du staff avec un grade supérieur ou égal au tien.' };
    }
  }
  if (membre && type !== 'warn' && membre.roles.highest.position >= botMembre.roles.highest.position) {
    return { ok: false, erreur: "Mon rôle est inférieur ou égal à celui de ce joueur (monte le rôle du bot dans la liste des rôles)." };
  }

  if (type === 'mute') {
    if (!dureeMs || dureeMs < 1000) return { ok: false, erreur: 'Durée invalide pour un mute.' };
    if (dureeMs > config.MUTE_MAX_MS) return { ok: false, erreur: 'Discord limite les mutes à 28 jours maximum.' };
    if (modMembre && dureeMs > dureeMuteMax(modMembre)) {
      const max = dureeMuteMax(modMembre);
      return { ok: false, erreur: max ? `Ton grade te permet de mute **${formatDuree(max)} maximum**.` : "Ton grade ne te permet pas de mute." };
    }
  }

  const user = membre?.user ?? (await guild.client.users.fetch(cibleId).catch(() => null));
  if (!user) return { ok: false, erreur: 'Utilisateur introuvable.' };

  // MP au joueur (avant kick/ban, sinon impossible)
  const dm = new EmbedBuilder()
    .setColor(COULEURS[type])
    .setTitle(`${LABELS[type]} sur ${guild.name}`)
    .addFields({ name: 'Raison', value: raison.slice(0, 1000) });
  if (dureeMs) dm.addFields({ name: 'Durée', value: formatDuree(dureeMs) });
  await user.send({ embeds: [dm] }).catch(() => {});

  const motifAudit = `${raison} (par ${moderateur.username ?? moderateur.tag})`.slice(0, 500);
  try {
    if (type === 'mute') await membre.timeout(dureeMs, motifAudit);
    if (type === 'kick') await membre.kick(motifAudit);
    if (type === 'ban') await guild.members.ban(cibleId, { reason: motifAudit });
  } catch (err) {
    console.error('Erreur sanction :', err);
    return { ok: false, erreur: "Action impossible (vérifie les permissions et la position de mon rôle)." };
  }

  const expiresAt = dureeMs && (type === 'ban' || type === 'mute') ? Date.now() + dureeMs : null;
  const id = await base.addSanction({
    guildId: guild.id, userId: cibleId, moderatorId: moderateur.id,
    type, reason: raison, durationMs: dureeMs, expiresAt,
  });

  const log = new EmbedBuilder()
    .setColor(COULEURS[type])
    .setTitle(`${LABELS[type]} #${id}${auto ? ' (automatique)' : ''}`)
    .addFields(
      { name: 'Joueur', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Modérateur', value: `${moderateur}`, inline: true },
      { name: 'Raison', value: raison.slice(0, 1000) },
    )
    .setTimestamp();
  if (dureeMs) log.addFields({ name: 'Durée', value: formatDuree(dureeMs), inline: true });
  await envoyerLog(guild, log);

  // Paliers automatiques sur les avertissements
  let palier = null;
  if (type === 'warn') {
    const n = await base.countSanctions(cibleId, 'warn');
    const p = config.PALIERS_WARN.find(x => x.seuil === n);
    if (p) {
      const sous = await appliquerSanction({
        guild, cibleId, moderateur: guild.client.user, type: p.action,
        raison: `Palier automatique : ${n} avertissements`,
        dureeMs: parseDuree(p.duree), auto: true,
      });
      if (sous.ok) palier = { action: p.action, id: sous.id };
    }
  }
  let propage = null;
  if (type === 'mute' || type === 'ban') {
    propage = await propager({ origine: guild, cibleId, user, type, dureeMs, raison, moderateur, id });
  }
  return { ok: true, id, palier, propage };
}

/** Répercute un mute / ban sur tous les autres serveurs où le bot est présent */
async function propager({ origine, cibleId, user, type, dureeMs, raison, moderateur, id }) {
  const motif = `[Réseau] ${raison} (depuis ${origine.name})`.slice(0, 500);
  let ok = 0;
  let total = 0;
  for (const guild of origine.client.guilds.cache.values()) {
    if (guild.id === origine.id) continue;
    total++;
    try {
      if (type === 'ban') {
        await guild.members.ban(cibleId, { reason: motif });
      } else {
        const m = await guild.members.fetch(cibleId).catch(() => null);
        if (!m || !m.moderatable) { total--; continue; } // pas membre de ce serveur : rien à faire
        await m.timeout(dureeMs, motif);
      }
      ok++;
      await envoyerLog(guild, new EmbedBuilder().setColor(COULEURS[type])
        .setTitle(`${LABELS[type]} propagé depuis ${origine.name} (#${id})`)
        .addFields(
          { name: 'Joueur', value: `${user} (\`${user.id}\`)`, inline: true },
          { name: 'Modérateur', value: `${moderateur.username ?? moderateur}`, inline: true },
          { name: 'Raison', value: raison.slice(0, 1000) },
        ).setTimestamp());
    } catch (err) {
      console.error(`Propagation impossible sur ${guild.name} :`, err.message);
    }
  }
  return { ok, total };
}

/** Retire un mute / ban sur les autres serveurs (unmute, unban, fin d'un ban temporaire) */
async function retirerPartout(origine, cibleId, type, motif) {
  let n = 0;
  for (const guild of origine.client.guilds.cache.values()) {
    if (guild.id === origine.id) continue;
    try {
      if (type === 'ban') {
        await guild.members.unban(cibleId, motif);
        n++;
      } else {
        const m = await guild.members.fetch(cibleId).catch(() => null);
        if (m && m.isCommunicationDisabled()) { await m.timeout(null, motif); n++; }
      }
    } catch { /* pas banni / pas de permission sur ce serveur */ }
  }
  return n;
}

module.exports = {
  EPH, LABELS, COULEURS,
  parseDuree, formatDuree, niveau, peut, dureeMuteMax, estExempte,
  salonConfigure, envoyerLog, appliquerSanction, retirerPartout,
};
