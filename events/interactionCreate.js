const { Events } = require('discord.js');
const { EPH } = require('../utils');

async function erreur(interaction, err) {
  console.error('Erreur interaction :', err);
  const msg = { content: '❌ Une erreur est survenue.', ...EPH };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
    else await interaction.reply(msg);
  } catch { /* ignoré */ }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const client = interaction.client;
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
      } else if (interaction.isButton()) {
        const handler = client.buttons.get(interaction.customId.split(':')[0]);
        if (handler) await handler(interaction);
      }
    } catch (err) {
      await erreur(interaction, err);
    }
  },
};
