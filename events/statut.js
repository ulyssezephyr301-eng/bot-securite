const { Events, ActivityType } = require('discord.js');
const config = require('../config');
const erlc = require('../erlc');

let compteur = 0;
let derniereSynchro = 0;

// Nombre de personnes surveillées : membres du serveur principal, sans les bots, moins les fondateurs
async function personnesSurveillees(client) {
  const guild = client.guilds.cache.get(config.ERLC.GUILD_ID);
  if (!guild) return null;
  if (Date.now() - derniereSynchro > 10 * 60_000) {
    try { await guild.members.fetch(); derniereSynchro = Date.now(); } catch (err) { console.error('Liste des membres indisponible :', err.message); }
  }
  const humains = guild.members.cache.filter(m => !m.user.bot).size;
  return Math.max(0, humains - config.ERLC.statut.fondateursARetirer);
}

async function majStatut(client) {
  const statuts = [];

  let enJeu = null;
  if (erlc.configure()) {
    try { enJeu = await erlc.nombreJoueurs(); } catch { /* API indisponible : on n'affiche pas ce statut */ }
  }
  if (enJeu > 0) statuts.push(`🎮 ${enJeu} joueur${enJeu > 1 ? 's' : ''} In Game`);

  const surveilles = await personnesSurveillees(client);
  if (surveilles !== null) statuts.push(`👀 Surveille ${surveilles} personne${surveilles > 1 ? 's' : ''}`);

  if (!statuts.length) statuts.push('🛡️ Sécurité');

  const texte = statuts[compteur++ % statuts.length];
  client.user.setPresence({
    activities: [{ name: 'Statut', type: ActivityType.Custom, state: texte }],
    status: 'online',
  });
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    majStatut(client).catch(console.error);
    setInterval(() => majStatut(client).catch(console.error), config.ERLC.statut.intervalleMs);
  },
};
