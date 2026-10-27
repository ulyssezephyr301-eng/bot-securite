const { Events, EmbedBuilder } = require('discord.js');
const base = require('../database');
const config = require('../config');
const { COULEURS, envoyerSanctionLog, retirerPartout, synchroUnbanJeu } = require('../utils');

// Débannit automatiquement les bans temporaires arrivés à échéance
async function verifierExpirations(client) {
  const bans = await base.bansExpires(Date.now());
  for (const b of bans) {
    const guild = client.guilds.cache.get(b.guild_id);
    if (!guild) continue;
    try { await guild.members.unban(b.user_id, 'Fin du bannissement temporaire'); } catch { /* déjà débanni */ }
    await retirerPartout(guild, b.user_id, 'ban', 'Fin du bannissement temporaire');
    if (guild.id === config.ERLC.GUILD_ID) await synchroUnbanJeu(guild, { userId: b.user_id });
    await base.desactiverParId(b.id);
    await envoyerSanctionLog(guild, new EmbedBuilder().setColor(COULEURS.unban)
      .setTitle(`Fin du ban #${b.id}`)
      .setDescription(`<@${b.user_id}> a été débanni automatiquement.`).setTimestamp());
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    await verifierExpirations(client).catch(console.error);
    setInterval(() => verifierExpirations(client).catch(console.error), 60_000);
  },
};
