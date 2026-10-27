const { Events, AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { COULEURS, envoyerLog, niveau } = require('../utils');

const compteurs = new Map(); // "guildId:executantId:type" -> [timestamps]

const PERMS_DANGEREUSES = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

const attendre = (ms) => new Promise(r => setTimeout(r, ms));

function exempte(guild, userId) {
  return userId === guild.client.user.id || userId === guild.ownerId
    || config.ANTINUKE.utilisateursExemptes.includes(userId) || config.SUPER_UTILISATEURS.includes(userId);
}

async function verifier(guild, typeAudit, cibleId, action, max) {
  const cfg = config.ANTINUKE;
  if (!cfg.actif) return;

  await attendre(800); // le journal d'audit a un petit délai
  const journal = await guild.fetchAuditLogs({ type: typeAudit, limit: 6 }).catch(() => null);
  const entree = journal?.entries.find(e =>
    Date.now() - e.createdTimestamp < 10_000 && (!cibleId || e.target?.id === cibleId));
  if (!entree || !entree.executor) return;

  const exec = entree.executor;
  if (exempte(guild, exec.id)) return;

  const cle = `${guild.id}:${exec.id}:${typeAudit}`;
  const now = Date.now();
  const liste = (compteurs.get(cle) ?? []).filter(t => now - t < cfg.fenetreMs);
  liste.push(now);
  compteurs.set(cle, liste);
  if (liste.length < max) return;
  compteurs.set(cle, []);

  // Retire les rôles dangereux de l'auteur
  const membre = await guild.members.fetch(exec.id).catch(() => null);
  let retires = [];
  if (membre) {
    const dangereux = membre.roles.cache.filter(r => !r.managed && r.id !== guild.id && r.permissions.any(PERMS_DANGEREUSES));
    if (dangereux.size) {
      const ok = await membre.roles.remove(dangereux, 'Anti-nuke : actions destructrices en masse').then(() => true).catch(() => false);
      if (ok) retires = dangereux.map(r => r.name);
    }
  }

  await envoyerLog(guild, new EmbedBuilder().setColor(COULEURS.alerte)
    .setTitle('🚨 ANTI-NUKE')
    .setDescription(`${exec} (\`${exec.id}\`) a effectué **${max} actions** (${action}) en moins de ${Math.round(cfg.fenetreMs / 1000)} s.`)
    .addFields({ name: 'Rôles retirés', value: retires.length ? retires.join(', ') : 'Aucun (permissions insuffisantes ou pas de rôle dangereux)' })
    .setTimestamp(), true);
}

// Un bot ajouté par quelqu'un qui n'est pas Fondateur est expulsé
async function controlerAjoutBot(membre) {
  const cfg = config.ANTINUKE;
  const guild = membre.guild;
  if (!cfg.actif || !cfg.bloquerAjoutBots || !membre.user.bot || membre.id === guild.client.user.id) return;

  await attendre(800);
  const journal = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 6 }).catch(() => null);
  const entree = journal?.entries.find(e => e.target?.id === membre.id && Date.now() - e.createdTimestamp < 15_000);
  const exec = entree?.executor;

  if (exec) {
    if (exempte(guild, exec.id)) return;
    const execMembre = await guild.members.fetch(exec.id).catch(() => null);
    if (execMembre && niveau(execMembre) >= 5) return;
  }

  let expulse = false;
  if (exec) expulse = await membre.kick('Anti-nuke : bot ajouté sans autorisation').then(() => true).catch(() => false);

  await envoyerLog(guild, new EmbedBuilder().setColor(COULEURS.alerte)
    .setTitle('🚨 BOT AJOUTÉ')
    .setDescription(`Le bot ${membre.user} (\`${membre.id}\`) a été ajouté par ${exec ? `${exec} (\`${exec.id}\`)` : '**un auteur inconnu**'}.`)
    .addFields({ name: 'Action', value: expulse ? 'Bot expulsé.' : exec ? "Expulsion impossible (permissions) : à retirer à la main." : 'Aucune action automatique (auteur introuvable dans le journal d\'audit) : vérifie ce bot.' })
    .setTimestamp(), true);
}

module.exports = {
  events: [
    { name: Events.ChannelDelete, execute: (c) => c.guild && verifier(c.guild, AuditLogEvent.ChannelDelete, c.id, 'suppression de salons', config.ANTINUKE.max) },
    { name: Events.GuildRoleDelete, execute: (r) => verifier(r.guild, AuditLogEvent.RoleDelete, r.id, 'suppression de rôles', config.ANTINUKE.max) },
    { name: Events.GuildBanAdd, execute: (b) => verifier(b.guild, AuditLogEvent.MemberBanAdd, b.user.id, 'bannissements', config.ANTINUKE.max) },
    { name: Events.ChannelCreate, execute: (c) => c.guild && verifier(c.guild, AuditLogEvent.ChannelCreate, c.id, 'création massive de salons', config.ANTINUKE.creationsMax) },
    { name: Events.GuildRoleCreate, execute: (r) => verifier(r.guild, AuditLogEvent.RoleCreate, r.id, 'création massive de rôles', config.ANTINUKE.creationsMax) },
    { name: Events.GuildMemberAdd, execute: controlerAjoutBot },
  ],
};
