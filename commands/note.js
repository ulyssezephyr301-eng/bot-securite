const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const base = require('../database');
const { EPH, COULEURS, peut } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Notes internes du staff sur un joueur')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('ajouter').setDescription('Ajouter une note')
      .addUserOption(o => o.setName('membre').setDescription('Le joueur').setRequired(true))
      .addStringOption(o => o.setName('texte').setDescription('Contenu de la note').setRequired(true)))
    .addSubcommand(s => s.setName('voir').setDescription('Voir les notes')
      .addUserOption(o => o.setName('membre').setDescription('Le joueur').setRequired(true))),

  async execute(i) {
    if (!peut(i.member, 'note')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
    const user = i.options.getUser('membre');

    if (i.options.getSubcommand() === 'ajouter') {
      const id = await base.addNote({
        guildId: i.guild.id, userId: user.id, authorId: i.user.id,
        content: i.options.getString('texte').slice(0, 1000),
      });
      return i.reply({ content: `📝 Note #${id} ajoutée sur ${user}.`, ...EPH });
    }

    const notes = await base.getNotes(user.id, 10);
    const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle(`Notes sur ${user.username}`);
    if (!notes.length) embed.setDescription('Aucune note.');
    for (const n of notes) {
      embed.addFields({
        name: `#${n.id} — <t:${Math.floor(n.created_at / 1000)}:d>`,
        value: `${String(n.content).slice(0, 900)}\n— <@${n.author_id}>`,
      });
    }
    return i.reply({ embeds: [embed], ...EPH });
  },
};
