// Enregistrement manuel des commandes (facultatif : le bot le fait tout seul quand elles changent).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const body = [];
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod = require(`./commands/${file}`);
  for (const cmd of mod.commands ?? [mod]) if (cmd.data) body.push(cmd.data.toJSON());
}

// Commandes globales : disponibles sur tous les serveurs où le bot est invité.
// Si Discord limite les enregistrements, on s'arrête avec un message au lieu d'attendre des heures.
const rest = new REST({ timeout: 20_000, rejectOnRateLimit: () => true }).setToken(process.env.DISCORD_TOKEN);
rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body })
  .then(() => console.log(`✅ ${body.length} commandes déployées (tous serveurs)`))
  .catch((err) => { console.error(`Enregistrement impossible : ${err.message}`); process.exit(1); });
