const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EPH, LABELS, COULEURS, peut, parseDuree, formatDuree, appliquerSanction, envoyerLog, retirerPartout } = require('../utils');
const base = require('../database');

const refuse = (i) => i.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ...EPH });
const DUREE_INVALIDE = '❌ Durée invalide. Exemples : `30m`, `2h`, `7d`, `1w`.';

async function sanctionner(i, type, dureeMs = null) {
  const user = i.options.getUser('membre');
  const raison = i.options.getString('raison');
  await i.deferReply();
  const res = await appliquerSanction({ guild: i.guild, cibleId: user.id, moderateur: i.user, type, raison, dureeMs });
  if (!res.ok) return i.editReply(`❌ ${res.erreur}`);
  let txt = `✅ **${LABELS[type]}** (#${res.id}) appliqué à ${user}${dureeMs ? ` pour **${formatDuree(dureeMs)}**` : ''}.\n**Raison :** ${raison}`;
  if (res.palier) txt += `\n⚠️ Palier automatique atteint : **${LABELS[res.palier.action]}** appliqué (#${res.palier.id}).`;
  if (res.propage && res.propage.total > 0) txt += `\n🌐 Répercuté sur **${res.propage.ok}/${res.propage.total}** autre(s) serveur(s).`;
  return i.editReply(txt);
}

const optMembre = (o) => o.setName('membre').setDescription('Le joueur').setRequired(true);
const optRaison = (o, requis = true) => o.setName('raison').setDescription('Raison').setRequired(requis);

const commands = [
  {
    data: new SlashCommandBuilder().setName('warn').setDescription('Avertir un joueur').setDMPermission(false)
      .addUserOption(optMembre).addStringOption(o => optRaison(o)),
    async execute(i) {
      if (!peut(i.member, 'warn')) return refuse(i);
      return sanctionner(i, 'warn');
    },
  },
  {
    data: new SlashCommandBuilder().setName('mute').setDescription('Rendre muet un joueur (timeout)').setDMPermission(false)
      .addUserOption(optMembre)
      .addStringOption(o => o.setName('duree').setDescription('Ex : 30m, 2h, 7d').setRequired(true))
      .addStringOption(o => optRaison(o)),
    async execute(i) {
      if (!peut(i.member, 'mute')) return refuse(i);
      const d = parseDuree(i.options.getString('duree'));
      if (!d) return i.reply({ content: DUREE_INVALIDE, ...EPH });
      return sanctionner(i, 'mute', d);
    },
  },
  {
    data: new SlashCommandBuilder().setName('unmute').setDescription("Retirer le mute d'un joueur").setDMPermission(false)
      .addUserOption(optMembre).addStringOption(o => optRaison(o, false)),
    async execute(i) {
      if (!peut(i.member, 'unmute')) return refuse(i);
      const user = i.options.getUser('membre');
      const raison = i.options.getString('raison') ?? 'Aucune raison précisée';
      const membre = await i.guild.members.fetch(user.id).catch(() => null);
      if (!membre) return i.reply({ content: "❌ Ce joueur n'est pas sur le serveur.", ...EPH });
      if (!membre.isCommunicationDisabled()) return i.reply({ content: "❌ Ce joueur n'est pas mute.", ...EPH });
      try {
        await membre.timeout(null, raison.slice(0, 500));
      } catch {
        return i.reply({ content: '❌ Impossible de retirer le mute (permissions ?).', ...EPH });
      }
      await base.desactiverSanctions(user.id, 'mute');
      const autres = await retirerPartout(i.guild, user.id, 'mute', raison.slice(0, 500));
      await envoyerLog(i.guild, new EmbedBuilder().setColor(COULEURS.unmute).setTitle('Unmute')
        .addFields({ name: 'Joueur', value: `${user}`, inline: true }, { name: 'Modérateur', value: `${i.user}`, inline: true }, { name: 'Raison', value: raison })
        .setTimestamp());
      return i.reply(`✅ ${user} n'est plus mute.${autres ? ` (aussi levé sur ${autres} autre(s) serveur(s))` : ''}`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('expulser').setDescription('Expulser un joueur').setDMPermission(false)
      .addUserOption(optMembre).addStringOption(o => optRaison(o)),
    async execute(i) {
      if (!peut(i.member, 'kick')) return refuse(i);
      return sanctionner(i, 'kick');
    },
  },
  {
    data: new SlashCommandBuilder().setName('ban').setDescription('Bannir un joueur').setDMPermission(false)
      .addUserOption(optMembre).addStringOption(o => optRaison(o))
      .addStringOption(o => o.setName('duree').setDescription('Ex : 7d (vide = définitif)').setRequired(false)),
    async execute(i) {
      if (!peut(i.member, 'ban')) return refuse(i);
      const txt = i.options.getString('duree');
      let d = null;
      if (txt) {
        d = parseDuree(txt);
        if (!d) return i.reply({ content: DUREE_INVALIDE, ...EPH });
      }
      return sanctionner(i, 'ban', d);
    },
  },
  {
    data: new SlashCommandBuilder().setName('unban').setDescription('Débannir un joueur').setDMPermission(false)
      .addStringOption(o => o.setName('id').setDescription('ID Discord du joueur').setRequired(true))
      .addStringOption(o => optRaison(o, false)),
    async execute(i) {
      if (!peut(i.member, 'unban')) return refuse(i);
      const id = i.options.getString('id').trim();
      const raison = i.options.getString('raison') ?? 'Aucune raison précisée';
      if (!/^\d{17,20}$/.test(id)) return i.reply({ content: '❌ ID invalide.', ...EPH });
      try {
        await i.guild.members.unban(id, raison.slice(0, 500));
      } catch {
        return i.reply({ content: "❌ Ce joueur n'est pas banni (ou je n'ai pas la permission).", ...EPH });
      }
      await base.desactiverSanctions(id, 'ban');
      const autres = await retirerPartout(i.guild, id, 'ban', raison.slice(0, 500));
      await envoyerLog(i.guild, new EmbedBuilder().setColor(COULEURS.unban).setTitle('Unban')
        .addFields({ name: 'Joueur', value: `<@${id}> (\`${id}\`)`, inline: true }, { name: 'Modérateur', value: `${i.user}`, inline: true }, { name: 'Raison', value: raison })
        .setTimestamp());
      return i.reply(`✅ <@${id}> a été débanni.${autres ? ` (aussi sur ${autres} autre(s) serveur(s))` : ''}`);
    },
  },
];

module.exports = { commands };
