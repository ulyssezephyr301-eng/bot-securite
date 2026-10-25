const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const base = require('../database');
const { trouverCompteRoblox, avatarRoblox } = require('../roblox');
const { EPH, COULEURS, peut } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info-joueur')
    .setDescription("Affiche les informations d'un joueur")
    .setDMPermission(false)
    .addUserOption(o => o.setName('membre').setDescription('Le joueur').setRequired(true)),

  async execute(i) {
    if (!peut(i.member, 'infoJoueur')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
    await i.deferReply();

    const user = i.options.getUser('membre');
    const membre = await i.guild.members.fetch(user.id).catch(() => null);
    if (!membre) return i.editReply("❌ Ce joueur n'est pas sur le serveur.");

    // Bloxlink renomme les membres avec leur pseudo Roblox : on le relit ici
    const pseudo = membre.nickname ?? user.username;
    const roblox = await trouverCompteRoblox(pseudo);

    const roles = membre.roles.cache
      .filter(r => r.id !== i.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`)
      .join(' ') || 'Aucun';

    const [nbSanctions, nbWarns, nbNotes] = await Promise.all([
      base.countSanctions(user.id),
      base.countSanctions(user.id, 'warn'),
      base.countNotes(user.id),
    ]);

    const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle(`Infos de ${membre.displayName}`);

    // Tout en haut : le compte Roblox
    if (roblox) {
      embed.setURL(`https://www.roblox.com/users/${roblox.id}/profile`);
      embed.addFields({
        name: '🎮 Compte Roblox',
        value: `**${roblox.nom}** (affichage : ${roblox.affichage})\nID : \`${roblox.id}\`\n[Voir le profil](https://www.roblox.com/users/${roblox.id}/profile)`,
      });
      const avatar = await avatarRoblox(roblox.id);
      embed.setThumbnail(avatar ?? user.displayAvatarURL());
    } else {
      embed.addFields({ name: '🎮 Compte Roblox', value: `Introuvable à partir du pseudo « ${pseudo} ».` });
      embed.setThumbnail(user.displayAvatarURL());
    }

    embed.addFields(
      { name: '💬 ID Discord', value: `\`${user.id}\``, inline: true },
      { name: '📅 Compte créé', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
      { name: '📥 Arrivé le', value: `<t:${Math.floor(membre.joinedTimestamp / 1000)}:D>`, inline: true },
      { name: '⚖️ Sanctions', value: `${nbSanctions} (dont ${nbWarns} avertissement(s))`, inline: true },
      { name: '📝 Notes', value: `${nbNotes}`, inline: true },
      { name: '🏷️ Rôles', value: roles.length > 1024 ? roles.slice(0, 1020) + '...' : roles },
    );

    return i.editReply({ embeds: [embed] });
  },
};
