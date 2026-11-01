const { Events } = require('discord.js');
const config = require('../config');
const verification = require('../verification');

// Contrôle régulier des joueurs en jeu (si l'expulsion est activée avec /verification jeu)
module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    setInterval(() => verification.controlerJoueurs(client).catch(console.error), config.VERIF.kickJeu.intervalleMs);
  },
};
