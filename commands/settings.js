const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../config');
const base = require('../database');
const { EPH, COULEURS, peut } = require('../utils');

const optSalon = (o) => o.setName('salon').setDescription('Salon').addChannelTypes(ChannelType.GuildText).setRequired(true);

// sous-commande -> [clé en base, libellé, valeur par défaut du config.js]
const SALONS = {
  logs: ['logs_channel', 'des logs généraux et alertes', () => config.LOG_CHANNEL_ID],
  sanctions: ['sanctions_channel', 'des sanctions', () => config.SANCTIONS_CHANNEL_ID],
  commandes: ['commands_channel', 'des commandes exécutées', () => config.COMMANDS_CHANNEL_ID],
  demandes: ['demandes_channel', 'des demandes de sanction', () => config.DEMANDES_CHANNEL_ID],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configuration du bot')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('logs').setDescription('Définir le salon des logs généraux et des alertes').addChannelOption(optSalon))
    .addSubcommand(s => s.setName('sanctions').setDescription('Définir le salon où arrivent toutes les sanctions').addChannelOption(optSalon))
    .addSubcommand(s => s.setName('commandes').setDescription('Définir le salon où arrivent toutes les commandes exécutées').addChannelOption(optSalon))
    .addSubcommand(s => s.setName('demandes').setDescription('Définir le salon des demandes de sanction').addChannelOption(optSalon))
    .addSubcommand(s => s.setName('antiraid').setDescription("Activer / désactiver l'anti-raid")
      .addBooleanOption(o => o.setName('actif').setDescription('Activé ?').setRequired(true)))
    .addSubcommand(s => s.setName('voir').setDescription('Voir la configuration actuelle')),

  async execute(i) {
    if (!peut(i.member, 'config')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
    const sub = i.options.getSubcommand();

    if (SALONS[sub]) {
      const salon = i.options.getChannel('salon');
      await base.setSetting(i.guild.id, SALONS[sub][0], salon.id);
      return i.reply({ content: `✅ Salon ${SALONS[sub][1]} : ${salon}` });
    }

    if (sub === 'antiraid') {
      const actif = i.options.getBoolean('actif');
      await base.setSetting(i.guild.id, 'antiraid', actif ? 'on' : 'off');
      return i.reply({ content: `🛡️ Anti-raid ${actif ? 'activé' : 'désactivé'}.` });
    }

    const valeurs = {};
    for (const [nom, [cle, , defaut]] of Object.entries(SALONS)) {
      const id = (await base.getSetting(i.guild.id, cle)) || defaut();
      valeurs[nom] = id ? `<#${id}>` : '⚠️ Non défini';
    }
    const raid = await base.getSetting(i.guild.id, 'antiraid');
    const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('Configuration')
      .addFields(
        { name: 'Salon des logs', value: valeurs.logs, inline: true },
        { name: 'Salon des sanctions', value: valeurs.sanctions + (valeurs.sanctions.startsWith('⚠️') ? '\n*(sinon, dans les logs)*' : ''), inline: true },
        { name: 'Salon des commandes', value: valeurs.commandes, inline: true },
        { name: 'Salon des demandes', value: valeurs.demandes, inline: true },
        { name: 'Anti-raid', value: raid === 'off' ? '❌ Désactivé' : config.ANTIRAID.actif ? '✅ Activé' : '❌ Désactivé (config.js)', inline: true },
        { name: 'Anti-spam', value: config.ANTISPAM.actif ? '✅ Activé' : '❌ Désactivé', inline: true },
        { name: 'Anti-nuke', value: config.ANTINUKE.actif ? '✅ Activé' : '❌ Désactivé', inline: true },
        { name: 'Limite staff', value: config.ABUS_STAFF.actif ? `✅ ${config.ABUS_STAFF.max} sanctions / ${Math.round(config.ABUS_STAFF.fenetreMs / 60000)} min` : '❌ Désactivée', inline: true },
      );
    return i.reply({ embeds: [embed], ...EPH });
  },
};
