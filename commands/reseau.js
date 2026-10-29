const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { EPH, COULEURS, niveau } = require('../utils');
const reseau = require('../reseau');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reseau')
    .setDescription('Réseau de serveurs : synchronisation des bannissements')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('synchroniser').setDescription('Applique tous les bans du réseau sur chaque serveur du bot (Fondateur)')
      .addBooleanOption(o => o.setName('importer').setDescription('Importer aussi les bans existants de chaque serveur dans le réseau').setRequired(false))),

  async execute(i) {
    if (niveau(i.member) < (config.NIVEAU_MIN.reseau ?? 5)) {
      return i.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ...EPH });
    }
    const importer = i.options.getBoolean('importer') ?? false;
    await i.deferReply();

    const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('🌐 Synchronisation des bans du réseau')
      .setDescription(importer
        ? 'Les bans du réseau sont appliqués sur chaque serveur, et les bans déjà présents sur chaque serveur sont ajoutés au réseau.'
        : 'Les bans du réseau sont appliqués sur chaque serveur.');
    let nb = 0;
    for (const guild of i.client.guilds.cache.values()) {
      const r = await reseau.synchroniserServeur(i.client, guild, { importer });
      nb++;
      if (nb > 24) continue;
      embed.addFields({
        name: guild.name,
        value: r.erreur
          ? `❌ ${r.erreur}`
          : `${r.applique} appliqué(s), ${r.deja} déjà présent(s)${r.echec ? `, ${r.echec} échec(s)` : ''}` +
            (importer ? `\n${r.importe} importé(s), répercutés ${r.propage} fois${r.echecPropage ? ` (${r.echecPropage} échec(s))` : ''}` : ''),
      });
    }
    if (nb > 24) embed.setFooter({ text: `${nb - 24} serveur(s) non affiché(s)` });
    return i.editReply({ embeds: [embed] });
  },
};
