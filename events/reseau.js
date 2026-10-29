const { Events } = require('discord.js');
const reseau = require('../reseau');

module.exports = {
  events: [
    // Quelqu'un rejoint un serveur du réseau sans être sur le serveur principal : expulsé + MP
    { name: Events.GuildMemberAdd, execute: (membre) => reseau.controlerArrivee(membre) },
    // Le bot rejoint un nouveau serveur : tous les bans du réseau y sont appliqués
    { name: Events.GuildCreate, execute: (guild) => reseau.nouveauServeur(guild) },
  ],
};
