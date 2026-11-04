const { Events } = require('discord.js');
const config = require('../config');
const base = require('../database');
const verification = require('../verification');

// Nouveau membre du serveur principal : rôle « non vérifié ».
// S'il était déjà vérifié (il revient après être parti), il retrouve directement son statut et son pseudo.
async function accueillir(membre) {
  if (membre.guild.id !== config.ERLC.GUILD_ID || membre.user.bot) return;
  const v = await base.getVerificationParDiscord(membre.id).catch(() => null);
  if (v) {
    await verification.passerVerifie(membre, 'Déjà vérifié (retour sur le serveur)');
    await membre.setNickname(v.roblox_name, 'Déjà vérifié').catch(() => {});
    return;
  }
  await verification.passerNonVerifie(membre, 'Nouveau membre : vérification à faire');
}

module.exports = {
  events: [
    // Contrôle régulier des joueurs en jeu (si l'expulsion est activée avec /verification jeu)
    {
      name: Events.ClientReady,
      once: true,
      execute(client) {
        setInterval(() => verification.controlerJoueurs(client).catch(console.error), config.VERIF.kickJeu.intervalleMs);
      },
    },
    { name: Events.GuildMemberAdd, execute: accueillir },
  ],
  accueillir, // exporté pour les tests
};
