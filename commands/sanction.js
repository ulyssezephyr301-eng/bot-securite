const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const base = require('../database');
const {
  EPH, LABELS, COULEURS, peut, parseDuree, formatDuree,
  appliquerSanction, envoyerSanctionLog, retirerPartout, synchroUnbanJeu, texteJeu,
} = require('../utils');

const refuse = (i) => i.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ...EPH });
const DUREE_INVALIDE = '❌ Durée invalide. Exemples : `30m`, `2h`, `7d`, `1w`.';

/* ---------- Appliquer une sanction ---------- */
async function sanctionner(i, type, dureeMs = null) {
  const user = i.options.getUser('membre');
  const raison = i.options.getString('raison');
  await i.deferReply();
  const res = await appliquerSanction({
    guild: i.guild, cibleId: user.id, moderateur: i.user, type, raison, dureeMs,
    robloxPseudo: i.options.getString('roblox'),
  });
  if (!res.ok) return i.editReply(`❌ ${res.erreur}`);
  let txt = `✅ **${LABELS[type]}** (#${res.id}) appliqué à ${user}${dureeMs ? ` pour **${formatDuree(dureeMs)}**` : ''}.\n**Raison :** ${raison}`;
  if (res.palier) txt += `\n⚠️ Palier automatique atteint : **${LABELS[res.palier.action]}** appliqué (#${res.palier.id}).`;
  if (res.propage && res.propage.total > 0) txt += `\n🌐 Répercuté sur **${res.propage.ok}/${res.propage.total}** autre(s) serveur(s).`;
  if (res.jeu) txt += texteJeu(res.jeu, 'ban');
  return i.editReply(txt);
}

/* ---------- Notes ---------- */
async function noter(i) {
  const user = i.options.getUser('membre');
  const id = await base.addNote({
    guildId: i.guild.id, userId: user.id, authorId: i.user.id,
    content: i.options.getString('texte').slice(0, 1000),
  });
  return i.reply({ content: `📝 Note #${id} ajoutée sur ${user}. Elle apparaît dans \`/sanction voir\`.`, ...EPH });
}

/* ---------- Levées ---------- */
async function unmute(i) {
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
  await envoyerSanctionLog(i.guild, new EmbedBuilder().setColor(COULEURS.unmute).setTitle('Unmute')
    .addFields({ name: 'Joueur', value: `${user}`, inline: true }, { name: 'Modérateur', value: `${i.user}`, inline: true }, { name: 'Raison', value: raison })
    .setTimestamp());
  return i.reply(`✅ ${user} n'est plus mute.${autres ? ` (aussi levé sur ${autres} autre(s) serveur(s))` : ''}`);
}

async function unban(i) {
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
  await envoyerSanctionLog(i.guild, new EmbedBuilder().setColor(COULEURS.unban).setTitle('Unban')
    .addFields({ name: 'Joueur', value: `<@${id}> (\`${id}\`)`, inline: true }, { name: 'Modérateur', value: `${i.user}`, inline: true }, { name: 'Raison', value: raison })
    .setTimestamp());
  const jeu = await synchroUnbanJeu(i.guild, { userId: id, pseudo: i.options.getString('roblox') });
  return i.reply(`✅ <@${id}> a été débanni.${autres ? ` (aussi sur ${autres} autre(s) serveur(s))` : ''}${texteJeu(jeu, 'unban')}`);
}

/* ---------- Mutes en cours ---------- */
async function muteActif(i) {
  await i.deferReply(EPH);
  const lignes = await base.getMutesActifs(Date.now());
  const actifs = [];
  for (const m of lignes) {
    const membre = await i.guild.members.fetch(m.user_id).catch(() => null);
    // Mute levé à la main (ou par Discord) sans passer par le bot : on le retire de la liste
    if (membre && !membre.isCommunicationDisabled()) {
      await base.desactiverParId(m.id);
      continue;
    }
    actifs.push(m);
  }

  const embed = new EmbedBuilder().setColor(COULEURS.mute).setTitle(`🔇 Mutes en cours (${actifs.length})`);
  if (!actifs.length) {
    embed.setDescription('✅ Aucun mute en cours.');
    return i.editReply({ embeds: [embed] });
  }
  for (const [idx, m] of actifs.slice(0, 10).entries()) {
    const user = await i.client.users.fetch(m.user_id).catch(() => null);
    const origine = i.client.guilds.cache.get(m.guild_id)?.name ?? 'serveur inconnu';
    const debut = Math.floor(m.created_at / 1000);
    const fin = m.expires_at ? Math.floor(m.expires_at / 1000) : null;
    embed.addFields({
      name: `${idx + 1}. ${user ? user.username : m.user_id} — #${m.id}`,
      value:
        `**Joueur :** <@${m.user_id}>\n` +
        `**Par :** <@${m.moderator_id}> • ${origine}\n` +
        `**Raison :** ${String(m.reason).slice(0, 400)}\n` +
        `**Depuis :** <t:${debut}:f> (<t:${debut}:R>)\n` +
        `**Jusqu'à :** ${fin ? `<t:${fin}:f> (<t:${fin}:R>)` : 'illimité'}` +
        (m.duration_ms ? `\n**Durée :** ${formatDuree(m.duration_ms)}` : ''),
    });
  }
  if (actifs.length > 10) embed.setFooter({ text: `Affichage des 10 premiers sur ${actifs.length}` });
  return i.editReply({ embeds: [embed] });
}

/* ---------- /sanction voir : historique + notes ---------- */
async function rendrePage(guild, userId, page) {
  const par = config.SANCTIONS_PAR_PAGE;
  const total = await base.countSanctions(userId);
  const pages = Math.max(1, Math.ceil(total / par));
  page = Math.min(Math.max(page, 0), pages - 1);
  const rows = await base.getSanctions(userId, page * par, par);
  const nbNotes = await base.countNotes(userId);
  const notes = nbNotes ? await base.getNotes(userId, 5) : [];
  const user = await guild.client.users.fetch(userId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(COULEURS.info)
    .setTitle(`Dossier de ${user ? user.username : userId}`)
    .setFooter({ text: `Page ${page + 1}/${pages} • ${total} sanction(s) • ${nbNotes} note(s)` });
  if (user) embed.setThumbnail(user.displayAvatarURL());

  // Notes du staff (affichées sur toutes les pages)
  if (notes.length) {
    let texte = notes
      .map(n => `**#${n.id}** • <t:${Math.floor(n.created_at / 1000)}:d> • <@${n.author_id}>\n> ${String(n.content).replace(/\n/g, ' ').slice(0, 160)}`)
      .join('\n');
    if (texte.length > 1000) texte = texte.slice(0, 997) + '…';
    embed.addFields({ name: `📝 Notes du staff (${nbNotes}${nbNotes > notes.length ? `, les ${notes.length} dernières` : ''})`, value: texte });
  }

  if (!rows.length) embed.addFields({ name: '⚖️ Sanctions', value: '✅ Aucune sanction.' });
  rows.forEach((s, idx) => {
    const enCours = (s.type === 'mute' || s.type === 'ban') && s.active && (!s.expires_at || s.expires_at > Date.now());
    const statut = s.type === 'mute' || s.type === 'ban' ? (enCours ? ' 🟢 en cours' : ' ⚪ terminé') : '';
    embed.addFields({
      name: `${idx + 1}. ${LABELS[s.type] ?? s.type} — #${s.id}${statut}`,
      value:
        `**Raison :** ${String(s.reason).slice(0, 500)}\n` +
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

const optMembre = (o) => o.setName('membre').setDescription('Le joueur').setRequired(true);
const optRaison = (o, requis = true) => o.setName('raison').setDescription('Raison').setRequired(requis);

// Une commande distincte par sanction : /sanction-warn, /sanction-mute, ...
function commande(nom, description, construire, action, executer) {
  return {
    data: construire(new SlashCommandBuilder().setName(nom).setDescription(description).setDMPermission(false)),
    async execute(i) {
      if (!peut(i.member, action)) return refuse(i);
      return executer(i);
    },
  };
}

const commands = [
  // /sanction : dossier d'un joueur (sanctions + notes) et mutes en cours
  {
    data: new SlashCommandBuilder()
      .setName('sanction')
      .setDescription("Dossier des joueurs : sanctions, notes et mutes en cours")
      .setDMPermission(false)
      .addSubcommand(s => s.setName('voir').setDescription("Affiche le dossier d'un joueur : sanctions et notes")
        .addUserOption(optMembre))
      .addSubcommand(s => s.setName('mute-actif').setDescription("Affiche les mutes en cours (qui, par qui, raison, jusqu'à quand)")),
    async execute(i) {
      if (!peut(i.member, 'voirSanctions')) return refuse(i);
      if (i.options.getSubcommand() === 'mute-actif') return muteActif(i);
      const user = i.options.getUser('membre');
      return i.reply({ ...(await rendrePage(i.guild, user.id, 0)), ...EPH });
    },
  },

  commande('sanction-note', 'Ajouter une note interne du staff sur un joueur',
    (b) => b.addUserOption(optMembre)
      .addStringOption(o => o.setName('texte').setDescription('Contenu de la note').setRequired(true).setMaxLength(1000)),
    'note', noter),

  commande('sanction-warn', 'Avertir un joueur',
    (b) => b.addUserOption(optMembre).addStringOption(o => optRaison(o)),
    'warn', (i) => sanctionner(i, 'warn')),

  commande('sanction-mute', 'Rendre muet un joueur (timeout)',
    (b) => b.addUserOption(optMembre)
      .addStringOption(o => o.setName('duree').setDescription('Ex : 30m, 2h, 7d').setRequired(true))
      .addStringOption(o => optRaison(o)),
    'mute', async (i) => {
      const d = parseDuree(i.options.getString('duree'));
      if (!d) return i.reply({ content: DUREE_INVALIDE, ...EPH });
      return sanctionner(i, 'mute', d);
    }),

  commande('sanction-unmute', "Retirer le mute d'un joueur",
    (b) => b.addUserOption(optMembre).addStringOption(o => optRaison(o, false)),
    'unmute', unmute),

  commande('sanction-expulser', 'Expulser un joueur du serveur',
    (b) => b.addUserOption(optMembre).addStringOption(o => optRaison(o)),
    'kick', (i) => sanctionner(i, 'kick')),

  commande('sanction-ban', 'Bannir un joueur',
    (b) => b.addUserOption(optMembre).addStringOption(o => optRaison(o))
      .addStringOption(o => o.setName('duree').setDescription('Ex : 7d (vide = définitif)').setRequired(false))
      .addStringOption(o => o.setName('roblox').setDescription("Pseudo Roblox exact pour le ban en jeu, si son pseudo Discord n'est pas un pseudo Roblox").setRequired(false)),
    'ban', async (i) => {
      const txt = i.options.getString('duree');
      let d = null;
      if (txt) {
        d = parseDuree(txt);
        if (!d) return i.reply({ content: DUREE_INVALIDE, ...EPH });
      }
      return sanctionner(i, 'ban', d);
    }),

  commande('sanction-unban', 'Débannir un joueur grâce à son ID',
    (b) => b.addStringOption(o => o.setName('id').setDescription('ID Discord du joueur').setRequired(true))
      .addStringOption(o => optRaison(o, false))
      .addStringOption(o => o.setName('roblox').setDescription("Pseudo Roblox exact pour le déban en jeu, si le compte n'est pas déjà connu du bot").setRequired(false)),
    'unban', unban),
];

module.exports = {
  commands,

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
        await envoyerSanctionLog(i.guild, new EmbedBuilder().setColor(COULEURS.unmute)
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
