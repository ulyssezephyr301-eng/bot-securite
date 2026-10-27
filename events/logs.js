const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COULEURS, envoyerLog } = require('../utils');

const coupe = (t, n = 1000) => (t && t.length > n ? t.slice(0, n) + '…' : t || '*vide*');

module.exports = {
  events: [
    {
      name: Events.MessageDelete,
      async execute(m) {
        if (!m.guild || m.author?.bot) return;
        await envoyerLog(m.guild, new EmbedBuilder().setColor(COULEURS.kick)
          .setTitle('🗑️ Message supprimé')
          .addFields(
            { name: 'Auteur', value: m.author ? `${m.author} (\`${m.author.id}\`)` : 'Inconnu', inline: true },
            { name: 'Salon', value: `<#${m.channelId}>`, inline: true },
            { name: 'Contenu', value: m.partial ? '*non disponible (message ancien)*' : coupe(m.content) },
          ).setTimestamp());
      },
    },
    {
      name: Events.MessageUpdate,
      async execute(avant, apres) {
        if (!apres.guild || apres.author?.bot || avant.partial || avant.content === apres.content) return;
        await envoyerLog(apres.guild, new EmbedBuilder().setColor(COULEURS.warn)
          .setTitle('✏️ Message modifié')
          .addFields(
            { name: 'Auteur', value: `${apres.author} (\`${apres.author.id}\`)`, inline: true },
            { name: 'Salon', value: `${apres.channel} — [Aller au message](${apres.url})`, inline: true },
            { name: 'Avant', value: coupe(avant.content) },
            { name: 'Après', value: coupe(apres.content) },
          ).setTimestamp());
      },
    },
    {
      name: Events.GuildMemberAdd,
      async execute(m) {
        await envoyerLog(m.guild, new EmbedBuilder().setColor(COULEURS.unmute)
          .setTitle('📥 Nouveau membre')
          .setDescription(`${m.user} (\`${m.id}\`)\nCompte créé <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`)
          .setThumbnail(m.user.displayAvatarURL()).setTimestamp());
      },
    },
    {
      name: Events.GuildMemberRemove,
      async execute(m) {
        await envoyerLog(m.guild, new EmbedBuilder().setColor(COULEURS.kick)
          .setTitle('📤 Membre parti')
          .setDescription(`${m.user} (\`${m.id}\`)`)
          .setThumbnail(m.user.displayAvatarURL()).setTimestamp());
      },
    },
    {
      name: Events.GuildMemberUpdate,
      async execute(avant, apres) {
        if (avant.partial) return;
        const ajoutes = apres.roles.cache.filter(r => !avant.roles.cache.has(r.id));
        const retires = avant.roles.cache.filter(r => !apres.roles.cache.has(r.id));
        if (!ajoutes.size && !retires.size) return;
        const embed = new EmbedBuilder().setColor(COULEURS.info)
          .setTitle('🏷️ Rôles modifiés')
          .setDescription(`${apres.user} (\`${apres.id}\`)`).setTimestamp();
        if (ajoutes.size) embed.addFields({ name: 'Ajoutés', value: ajoutes.map(r => `${r}`).join(' ') });
        if (retires.size) embed.addFields({ name: 'Retirés', value: retires.map(r => `${r}`).join(' ') });
        await envoyerLog(apres.guild, embed);

        // Alerte : un rôle avec des permissions dangereuses vient d'être donné
        const dangereux = ajoutes.filter(r => r.permissions.any([
          PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers,
        ]));
        if (dangereux.size) {
          await envoyerLog(apres.guild, new EmbedBuilder().setColor(COULEURS.alerte)
            .setTitle('🚨 Rôle à permissions dangereuses attribué')
            .setDescription(`${apres.user} (\`${apres.id}\`) a reçu : ${dangereux.map(r => `${r}`).join(' ')}\nVérifie que c'est voulu (journal d'audit du serveur).`)
            .setTimestamp(), true);
        }
      },
    },
  ],
};
