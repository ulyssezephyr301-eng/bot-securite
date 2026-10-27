const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../config');
const base = require('../database');
const { EPH, LABELS, COULEURS, peut, parseDuree, formatDuree, salonConfigure, appliquerSanction } = require('../utils');

async function prevenir(client, userId, texte) {
  const u = await client.users.fetch(userId).catch(() => null);
  if (u) await u.send(texte).catch(() => {});
}

// Poste un message dans le fil de la demande (le fil a le même ID que le message d'origine) puis l'archive
async function cloreFil(canal, d, texte) {
  if (!d.message_id) return;
  const fil = (await canal.threads?.fetch(d.message_id).catch(() => null))
    ?? (await canal.guild.channels.fetch(d.message_id).catch(() => null));
  if (!fil || !fil.isThread()) return;
  await fil.send(texte).catch(() => {});
  await fil.setArchived(true).catch(() => {});
}

async function traiter(i, accepter) {
  if (!peut(i.member, 'valider')) {
    return i.reply({ content: '❌ Tu ne peux pas valider les demandes.', ...EPH });
  }
  const id = Number(i.customId.split(':')[1]);
  const d = await base.getDemande(id);
  if (!d || d.status !== 'pending') {
    return i.reply({ content: '⚠️ Cette demande a déjà été traitée.', ...EPH });
  }
  if (d.requester_id === i.user.id) {
    return i.reply({ content: '❌ Tu ne peux pas traiter ta propre demande.', ...EPH });
  }
  const original = i.message.embeds[0];

  // Refus : on demande d'abord une raison dans une fenêtre
  if (!accepter) {
    const modal = new ModalBuilder()
      .setCustomId(`dem_refus:${id}`)
      .setTitle(`Refuser la demande #${id}`)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('raison')
          .setLabel('Raison du refus')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(3)
          .setMaxLength(500)
          .setRequired(true),
      ));
    return i.showModal(modal);
  }

  if (!(await base.claimDemande(id, 'accepted'))) return i.reply({ content: '⚠️ Déjà traitée.', ...EPH });
  await i.deferUpdate();
  const demandeur = await i.client.users.fetch(d.requester_id).catch(() => null);
  const res = await appliquerSanction({
    guild: i.guild,
    cibleId: d.user_id,
    moderateur: i.user,
    type: d.type,
    raison: `${d.reason} (demandé par ${demandeur?.username ?? d.requester_id})`,
    dureeMs: d.duration_ms,
  });
  if (!res.ok) {
    await base.resetDemande(id);
    return i.followUp({ content: `❌ ${res.erreur}`, ...EPH });
  }
  const embed = EmbedBuilder.from(original).setColor(COULEURS.unmute)
    .setTitle(`Demande #${id} — ✅ Acceptée`)
    .addFields({ name: 'Acceptée par', value: `${i.user}`, inline: true }, { name: 'Sanction', value: `#${res.id}`, inline: true });
  await i.editReply({ embeds: [embed], components: [] });
  await cloreFil(i.channel, d, `✅ Demande **acceptée** par ${i.user} (sanction #${res.id}).`);
  await prevenir(i.client, d.requester_id, `✅ Ta demande de sanction #${id} a été **acceptée** par ${i.user.username} (sanction #${res.id}).`);
}

// Envoi de la fenêtre « raison du refus »
async function refuser(i) {
  if (!peut(i.member, 'valider')) {
    return i.reply({ content: '❌ Tu ne peux pas valider les demandes.', ...EPH });
  }
  const id = Number(i.customId.split(':')[1]);
  const d = await base.getDemande(id);
  if (!d || d.status !== 'pending') {
    return i.reply({ content: '⚠️ Cette demande a déjà été traitée.', ...EPH });
  }
  if (d.requester_id === i.user.id) {
    return i.reply({ content: '❌ Tu ne peux pas traiter ta propre demande.', ...EPH });
  }
  const raison = i.fields.getTextInputValue('raison').trim();
  if (!(await base.claimDemande(id, 'refused'))) {
    return i.reply({ content: '⚠️ Déjà traitée.', ...EPH });
  }

  const original = i.message?.embeds?.[0];
  const embed = (original ? EmbedBuilder.from(original) : new EmbedBuilder()).setColor(COULEURS.kick)
    .setTitle(`Demande #${id} — ❌ Refusée`)
    .addFields(
      { name: 'Refusée par', value: `${i.user}`, inline: true },
      { name: 'Raison du refus', value: raison.slice(0, 1000) },
    );
  if (i.isFromMessage()) {
    await i.update({ embeds: [embed], components: [] });
  } else {
    await i.reply({ content: '✅ Demande refusée.', ...EPH });
    const m = d.message_id ? await i.channel.messages.fetch(d.message_id).catch(() => null) : null;
    if (m) await m.edit({ embeds: [embed], components: [] }).catch(() => {});
  }
  await cloreFil(i.channel, d, `❌ Demande **refusée** par ${i.user}.\n**Raison :** ${raison}`);
  await prevenir(i.client, d.requester_id, `❌ Ta demande de sanction #${id} a été **refusée** par ${i.user.username}.\n**Raison :** ${raison}`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demande-sanction')
    .setDescription('Demander une sanction à un staff habilité')
    .setDMPermission(false)
    .addUserOption(o => o.setName('membre').setDescription('Le joueur').setRequired(true))
    .addStringOption(o => o.setName('sanction').setDescription('Type de sanction').setRequired(true)
      .addChoices(
        { name: 'Avertissement', value: 'warn' },
        { name: 'Mute', value: 'mute' },
        { name: 'Expulsion', value: 'kick' },
        { name: 'Bannissement', value: 'ban' },
      ))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Durée (obligatoire pour un mute) ex : 30m, 2h, 7d').setRequired(false)),

  async execute(i) {
    if (!peut(i.member, 'demande')) {
      return i.reply({ content: "❌ Tu n'as pas la permission de faire une demande.", ...EPH });
    }
    const user = i.options.getUser('membre');
    const type = i.options.getString('sanction');
    const raison = i.options.getString('raison');
    const dureeTxt = i.options.getString('duree');
    let dureeMs = null;
    if (dureeTxt) {
      dureeMs = parseDuree(dureeTxt);
      if (!dureeMs) return i.reply({ content: '❌ Durée invalide. Exemples : `30m`, `2h`, `7d`.', ...EPH });
    }
    if (type === 'mute' && !dureeMs) return i.reply({ content: '❌ Un mute nécessite une durée.', ...EPH });
    if (type === 'mute' && dureeMs > config.MUTE_MAX_MS) return i.reply({ content: '❌ Un mute ne peut pas dépasser 28 jours.', ...EPH });
    if (type !== 'mute' && type !== 'ban') dureeMs = null;

    const salon = await salonConfigure(i.guild, 'demandes_channel', config.DEMANDES_CHANNEL_ID);
    if (!salon) {
      return i.reply({ content: "❌ Le salon des demandes n'est pas configuré. Un admin doit faire `/config demandes`.", ...EPH });
    }

    const id = await base.addDemande({
      guildId: i.guild.id, userId: user.id, requesterId: i.user.id, type, reason: raison, durationMs: dureeMs,
    });

    const embed = new EmbedBuilder()
      .setColor(COULEURS.warn)
      .setTitle(`Demande de sanction #${id}`)
      .addFields(
        { name: 'Joueur', value: `${user} (\`${user.id}\`)`, inline: true },
        { name: 'Sanction', value: LABELS[type], inline: true },
        { name: 'Demandé par', value: `${i.user}`, inline: true },
        { name: 'Raison', value: raison.slice(0, 1000) },
      )
      .setTimestamp();
    if (dureeMs) embed.addFields({ name: 'Durée', value: formatDuree(dureeMs), inline: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dem_ok:${id}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dem_no:${id}`).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    const msg = await salon.send({ embeds: [embed], components: [row] });
    await base.setDemandeMessage(id, msg.id);

    // Un fil de discussion par demande
    let fil = null;
    try {
      fil = await msg.startThread({
        name: `Demande #${id} • ${user.username} • ${LABELS[type]}`.slice(0, 100),
        autoArchiveDuration: 1440,
      });
      await fil.send({
        content: `${i.user} Discussion de la demande #${id}. Un Administrateur ou plus peut l'accepter ✅ ou la refuser ❌ avec les boutons du message d'origine (une raison est demandée en cas de refus).`,
        allowedMentions: { users: [i.user.id] },
      });
    } catch (err) {
      console.error('Création du fil impossible (permission « Créer des fils publics » ?) :', err.message);
    }
    return i.reply({ content: `✅ Demande #${id} envoyée dans ${salon}${fil ? ` (fil : ${fil})` : ''}.`, ...EPH });
  },

  buttons: {
    dem_ok: (i) => traiter(i, true),
    dem_no: (i) => traiter(i, false),
  },

  modals: {
    dem_refus: refuser,
  },
};
