const { Events } = require('discord.js');
const { createHash } = require('crypto');
const base = require('../database');

// Enregistre les commandes slash auprès de Discord SEULEMENT si elles ont changé depuis la dernière fois.
// Plus besoin de `npm run deploy` au démarrage : le bot s'allume tout de suite, sans attendre Discord.
async function enregistrer(client) {
  const corps = [...client.commands.values()].map(c => c.data.toJSON()).sort((a, b) => a.name.localeCompare(b.name));
  const empreinte = createHash('sha256').update(JSON.stringify(corps)).digest('hex');
  if ((await base.getSetting('global', 'commandes_empreinte')) === empreinte) return { change: false, nombre: corps.length };
  await client.application.commands.set(corps);
  await base.setSetting('global', 'commandes_empreinte', empreinte);
  console.log(`✅ ${corps.length} commandes enregistrées auprès de Discord`);
  return { change: true, nombre: corps.length };
}

function lancer(client) {
  enregistrer(client).catch((err) => {
    console.error(`Enregistrement des commandes impossible (nouvel essai dans 30 min) : ${err.message}`);
    setTimeout(() => lancer(client), 30 * 60_000).unref();
  });
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute: lancer,
  enregistrer, // exporté pour les tests
};
