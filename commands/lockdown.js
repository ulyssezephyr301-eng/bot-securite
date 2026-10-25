const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { EPH, peut } = require('../utils');

async function changer(i, verrouiller) {
  if (!peut(i.member, 'lockdown')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
  const serveur = i.options.getBoolean('serveur') ?? false;
  await i.deferReply();
  const everyone = i.guild.roles.everyone;
  const valeur = verrouiller ? false : null;

  const salons = serveur
    ? [...i.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).values()]
    : [i.channel];

  let ok = 0;
  for (const salon of salons) {
    try {
      await salon.permissionOverwrites.edit(everyone, { SendMessages: valeur }, { reason: `${verrouiller ? 'Lockdown' : 'Unlock'} par ${i.user.username}` });
      ok++;
    } catch { /* salon ignoré */ }
  }
  const cible = serveur ? `${ok} salon(s)` : `${i.channel}`;
  return i.editReply(verrouiller ? `🔒 ${cible} verrouillé(s).` : `🔓 ${cible} déverrouillé(s).`);
}

const optServeur = (o) => o.setName('serveur').setDescription('Appliquer à tous les salons textuels du serveur').setRequired(false);

const commands = [
  {
    data: new SlashCommandBuilder().setName('lockdown').setDescription('Verrouiller le salon (ou tout le serveur)')
      .setDMPermission(false).addBooleanOption(optServeur),
    execute: (i) => changer(i, true),
  },
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('Déverrouiller le salon (ou tout le serveur)')
      .setDMPermission(false).addBooleanOption(optServeur),
    execute: (i) => changer(i, false),
  },
  {
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Définir le mode lent du salon')
      .setDMPermission(false)
      .addIntegerOption(o => o.setName('secondes').setDescription('0 pour désactiver (max 21600)').setMinValue(0).setMaxValue(21600).setRequired(true)),
    async execute(i) {
      if (!peut(i.member, 'lockdown')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
      const s = i.options.getInteger('secondes');
      try {
        await i.channel.setRateLimitPerUser(s);
      } catch {
        return i.reply({ content: '❌ Impossible de modifier ce salon.', ...EPH });
      }
      return i.reply(s ? `🐌 Mode lent : **${s} s** dans ${i.channel}.` : `✅ Mode lent désactivé dans ${i.channel}.`);
    },
  },
];

module.exports = { commands };
