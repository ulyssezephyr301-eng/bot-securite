const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const base = require('../database');
const { EPH, LABELS, COULEURS, peut, formatDuree, envoyerLog } = require('../utils');

async function rendrePage(guild, userId, page) {
  const par = config.SANCTIONS_PAR_PAGE;
  const total = await base.countSanctions(userId);
  const pages = Math.max(1, Math.ceil(total / par));
  page = Math.min(Math.max(page, 0), pages - 1);
  const rows = await base.getSanctions(userId, page * par, par);
  const user = await guild.client.users.fetch(userId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(COULEURS.info)
    .setTitle(`Sanctions de ${user ? user.username : userId}`)
    .setFooter({ text: `Page ${page + 1}/${pages} • ${total} sanction(s)` });
  if (user) embed.setThumbnail(user.displayAvatarURL());
  if (!rows.length) embed.setDescription('✅ Aucune sanction.');

  rows.forEach((s, idx) => {
    const enCours = (s.type === 'mute' || s.type === 'ban') && s.active && (!s.expires_at || s.expires_at > Date.now());
    const statut = s.type === 'mute' || s.type === 'ban' ? (enCours ? ' 🟢 en cours' : ' ⚪ terminé') : '';
    embed.addFields({
      name: `${idx + 1}. ${LABELS[s.type] ?? s.type} — #${s.id}${statut}`,
      value:
        `**Raison :** ${String(s.reason).slice(0, 600)}\n` +
        `**Par :** <@${s.moderator_id}> • ${guild.client.guilds.cache.get(s.guild_id)?.name ?? 'serveur inconnu'}\n` +
        `**Date :** <t:${Math.floor(s.created_at / 1000)}:f>` +
        (s.duration_ms ? `\n**Durée :** ${formatDuree(s.duration_ms)}` : ''),
    });
  });

  const components = [];
  if (rows.length) {
    components.push(new ActionRowBuilder().addComponents(
      rows.map((s, idx) => new ButtonBuilder()
        .setCustomId(`sd:${userId}:${page}:${s.id}`)
        .setLabel(String(idx + 1)).setEmoji('🗑️').setStyle(ButtonStyle.Danger)),
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sp:${userId}:${page - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId('noop').setLabel(`${page + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`sp:${userId}:${page + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  ));

  return { embeds: [embed], components };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sanction')
    .setDescription("Affiche l'historique des sanctions d'un joueur")
    .setDMPermission(false)
    .addUserOption(o => o.setName('membre').setDescription('Le joueur').setRequired(true)),

  async execute(i) {
    if (!peut(i.member, 'voirSanctions')) {
      return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
    }
    const user = i.options.getUser('membre');
    await i.reply({ ...(await rendrePage(i.guild, user.id, 0)), ...EPH });
  },

  buttons: {
    // Changement de page
    async sp(i) {
      if (!peut(i.member, 'voirSanctions')) return i.reply({ content: '❌ Permission refusée.', ...EPH });
      const [, userId, page] = i.customId.split(':');
      return i.update(await rendrePage(i.guild, userId, Number(page)));
    },

    // Clic sur une poubelle -> demande de confirmation
    async sd(i) {
      if (!peut(i.member, 'delsanction')) {
        return i.reply({ content: '❌ Tu ne peux pas supprimer de sanctions.', ...EPH });
      }
      const [, userId, page, id] = i.customId.split(':');
      const s = await base.getSanction(Number(id));
      if (!s) return i.update(await rendrePage(i.guild, userId, Number(page)));

      const embed = new EmbedBuilder()
        .setColor(COULEURS.kick)
        .setTitle(`Supprimer la sanction #${id} ?`)
        .setDescription(`**${LABELS[s.type] ?? s.type}** — ${String(s.reason).slice(0, 500)}\n\nCette action est irréversible. (Elle supprime l'historique, elle ne débannit pas / ne démute pas.)`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sc:${userId}:${page}:${id}`).setLabel('Confirmer').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`sp:${userId}:${page}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      return i.update({ embeds: [embed], components: [row] });
    },

    // Confirmation de suppression
    async sc(i) {
      if (!peut(i.member, 'delsanction')) {
        return i.reply({ content: '❌ Tu ne peux pas supprimer de sanctions.', ...EPH });
      }
      const [, userId, page, id] = i.customId.split(':');
      const s = await base.getSanction(Number(id));
      if (s) {
        await base.deleteSanction(Number(id));
        await envoyerLog(i.guild, new EmbedBuilder().setColor(COULEURS.unmute)
          .setTitle(`Sanction #${id} supprimée`)
          .addFields(
            { name: 'Joueur', value: `<@${userId}>`, inline: true },
            { name: 'Supprimée par', value: `${i.user}`, inline: true },
            { name: 'Type / raison', value: `${LABELS[s.type] ?? s.type} — ${String(s.reason).slice(0, 500)}` },
          ).setTimestamp());
      }
      return i.update(await rendrePage(i.guild, userId, Number(page)));
    },
  },
};
