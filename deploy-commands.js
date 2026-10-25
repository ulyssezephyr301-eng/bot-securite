require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const body = [];
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod = require(`./commands/${file}`);
  for (const cmd of mod.commands ?? [mod]) if (cmd.data) body.push(cmd.data.toJSON());
}

// Commandes globales : disponibles sur tous les serveurs où le bot est invité
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body });
  console.log(`✅ ${body.length} commandes déployées (tous serveurs)`);
})().catch(console.error);
