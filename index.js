require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { initDatabase } = require('./database');
const http = require('http');
const oauth = require('./oauth');

// Une erreur isolée ne doit pas arrêter le bot
process.on('unhandledRejection', (err) => console.error('Promesse rejetée non gérée :', err));
process.on('uncaughtException', (err) => console.error('Exception non gérée :', err));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // à activer dans le portail développeur
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // à activer dans le portail développeur
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();

// Serveur web : garde le bot éveillé sur Render (ping) et reçoit le retour de la connexion Roblox (OAuth)
http.createServer((req, res) => {
  oauth.gerer(req, res, client).catch((err) => {
    console.error('Erreur serveur web :', err.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(process.env.PORT || 3000);

// Chargement des commandes
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod = require(`./commands/${file}`);
  for (const cmd of mod.commands ?? [mod]) {
    if (cmd.data) client.commands.set(cmd.data.name, cmd);
  }
  for (const [prefixe, fn] of Object.entries(mod.buttons ?? {})) client.buttons.set(prefixe, fn);
  for (const [prefixe, fn] of Object.entries(mod.modals ?? {})) client.modals.set(prefixe, fn);
}

// Chargement des événements
for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
  const mod = require(`./events/${file}`);
  for (const ev of mod.events ?? [mod]) {
    const run = (...args) => Promise.resolve().then(() => ev.execute(...args)).catch(err => console.error(`Erreur événement ${ev.name} :`, err));
    if (ev.once) client.once(ev.name, run);
    else client.on(ev.name, run);
  }
}

(async () => {
  await initDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();
