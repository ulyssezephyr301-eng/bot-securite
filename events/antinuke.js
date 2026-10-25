const { Events, AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { COULEURS, envoyerLog } = require('../utils');

const compteurs = new Map(); // "guildId:executantId" -> [timestamps]

const PERMS_DANGEREUSES = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

async function verifier(guild, typeAudit, cibleId, action) {
  const cfg = config.ANTINUKE;
  if (!cfg.actif) return;

  await new Promise(r => setTimeout(r, 800)); // le journal d'audit a un petit délai
  const journal = await guild.fetchAuditLogs({ type: typeAudit, limit: 6 }).catch(() => null);
  const entree = journal?.entries.find(e =>
    Date.now() - e.createdTimestamp < 10_000 && (!cibleId || e.target?.id === cibleId));
  if (!entree || !entree.executor) return;

  const exec = entree.executor;
  if (exec.id === guild.client.user.id || exec.id === guild.ownerId) return;
  if (cfg.utilisateursExemptes.includes(exec.id) || config.SUPER_UTILISATEURS.includes(exec.id)) return;

  const cle = `${guild.id}:${exec.id}`;
  const now = Date.now();
  const liste = (compteurs.get(cle) ?? []).filter(t => now - t < cfg.fenetreMs);
  liste.push(now);
  compteurs.set(cle, liste);
  if (liste.length < cfg.max) return;
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
    .setDescription(`${exec} (\`${exec.id}\`) a effectué **${cfg.max} actions** (${action}) en moins de ${Math.round(cfg.fenetreMs / 1000)} s.`)
    .addFields({ name: 'Rôles retirés', value: retires.length ? retires.join(', ') : "Aucun (permissions insuffisantes ou pas de rôle dangereux)" })
    .setTimestamp());
}

module.exports = {
  events: [
    { name: Events.ChannelDelete, execute: (c) => c.guild && verifier(c.guild, AuditLogEvent.ChannelDelete, c.id, 'suppression de salons') },
    { name: Events.GuildRoleDelete, execute: (r) => verifier(r.guild, AuditLogEvent.RoleDelete, r.id, 'suppression de rôles') },
    { name: Events.GuildBanAdd, execute: (b) => verifier(b.guild, AuditLogEvent.MemberBanAdd, b.user.id, 'bannissements') },
  ],
};
