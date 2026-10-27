const { Events, EmbedBuilder } = require('discord.js');
const erlc = require('../erlc');
const { COULEURS, envoyerSanctionLog } = require('../utils');

// Toutes les minutes : exécute les ban / unban en jeu mis en attente parce que le serveur ER:LC était vide
async function traiter(client) {
  if (!erlc.configure()) return;
  const faits = await erlc.traiterAttente();
  for (const l of faits) {
    const guild = client.guilds.cache.get(l.guild_id);
    if (!guild) continue;
    await envoyerSanctionLog(guild, new EmbedBuilder()
      .setColor(l.echec ? COULEURS.warn : COULEURS.unmute)
      .setTitle(l.echec ? '🎮 Commande en jeu abandonnée' : '🎮 Commande en attente exécutée')
      .setDescription(`${l.description ?? l.commande}${l.echec ? `\nAbandon après 10 essais : ${l.echec}` : ''}`)
      .setTimestamp());
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    setInterval(() => traiter(client).catch(console.error), 60_000);
  },
};
