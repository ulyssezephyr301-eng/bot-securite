const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../config');
const base = require('../database');
const { EPH, COULEURS, peut } = require('../utils');

const optSalon = (o) => o.setName('salon').setDescription('Salon').addChannelTypes(ChannelType.GuildText).setRequired(true);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configuration du bot')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('logs').setDescription('Définir le salon des logs').addChannelOption(optSalon))
    .addSubcommand(s => s.setName('demandes').setDescription('Définir le salon des demandes de sanction').addChannelOption(optSalon))
    .addSubcommand(s => s.setName('antiraid').setDescription("Activer / désactiver l'anti-raid")
      .addBooleanOption(o => o.setName('actif').setDescription('Activé ?').setRequired(true)))
    .addSubcommand(s => s.setName('voir').setDescription('Voir la configuration actuelle')),

  async execute(i) {
    if (!peut(i.member, 'config')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
    const sub = i.options.getSubcommand();

    if (sub === 'logs' || sub === 'demandes') {
      const salon = i.options.getChannel('salon');
      await base.setSetting(i.guild.id, sub === 'logs' ? 'logs_channel' : 'demandes_channel', salon.id);
      return i.reply({ content: `✅ Salon des ${sub} : ${salon}`, ...EPH });
    }

    if (sub === 'antiraid') {
      const actif = i.options.getBoolean('actif');
      await base.setSetting(i.guild.id, 'antiraid', actif ? 'on' : 'off');
      return i.reply({ content: `🛡️ Anti-raid ${actif ? 'activé' : 'désactivé'}.`, ...EPH });
    }

    const [logs, demandes, raid] = await Promise.all([
      base.getSetting(i.guild.id, 'logs_channel'),
      base.getSetting(i.guild.id, 'demandes_channel'),
      base.getSetting(i.guild.id, 'antiraid'),
    ]);
    const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('Configuration')
      .addFields(
        { name: 'Salon des logs', value: logs || config.LOG_CHANNEL_ID ? `<#${logs || config.LOG_CHANNEL_ID}>` : 'Non défini', inline: true },
        { name: 'Salon des demandes', value: demandes || config.DEMANDES_CHANNEL_ID ? `<#${demandes || config.DEMANDES_CHANNEL_ID}>` : 'Non défini', inline: true },
        { name: 'Anti-raid', value: raid === 'off' ? '❌ Désactivé' : config.ANTIRAID.actif ? '✅ Activé' : '❌ Désactivé (config.js)', inline: true },
        { name: 'Anti-spam', value: config.ANTISPAM.actif ? '✅ Activé' : '❌ Désactivé', inline: true },
        { name: 'Anti-nuke', value: config.ANTINUKE.actif ? '✅ Activé' : '❌ Désactivé', inline: true },
      );
    return i.reply({ embeds: [embed], ...EPH });
  },
};
