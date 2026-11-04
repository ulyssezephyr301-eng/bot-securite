const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../config');
const base = require('../database');
const erlc = require('../erlc');
const { compteRobloxExact } = require('../roblox');
const verification = require('../verification');
const oauth = require('../oauth');
const { EPH, COULEURS, niveau } = require('../utils');

const PRINCIPAL = () => config.ERLC.GUILD_ID;
const niveauRequis = () => config.NIVEAU_MIN.verification ?? 4;

const bouton = (id, label, emoji, style = ButtonStyle.Success) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

/* ---------- Côté membre : bouton « Se vérifier » ---------- */
// Connexion Roblox (OAuth) si elle est configurée : le membre est envoyé sur la page officielle de Roblox.
// Sinon : méthode du code dans la description du profil.
async function demarrer(i) {
  if (i.guild.id !== PRINCIPAL()) {
    return i.reply({ content: '❌ La vérification se fait sur le serveur Discord principal.', ...EPH });
  }
  if (oauth.mode() !== 'oauth') return ouvrirFenetre(i);

  await i.deferReply(EPH);
  const lien = await oauth.lienAutorisation(i.user.id);
  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('Connexion avec Roblox')
    .setDescription(
      'Clique sur le bouton ci-dessous : tu arrives sur la **page officielle de Roblox**, où tu autorises la connexion de ton compte.\n\n' +
      "🔒 Ton mot de passe n'est **jamais** communiqué au bot : Roblox lui donne seulement l'identifiant de ton compte.\n" +
      `Ensuite, ton pseudo Discord devient ton pseudo Roblox. Le lien est valable ${config.VERIF.oauthValiditeMin} minutes et ne sert qu'une fois.`,
    );
  const bouton = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(lien).setLabel('Se connecter avec Roblox').setEmoji('🎮');
  return i.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(bouton)] });
}

/* ---------- Méthode du code (secours) : fenêtre, code ---------- */
async function ouvrirFenetre(i) {
  if (i.guild.id !== PRINCIPAL()) {
    return i.reply({ content: '❌ La vérification se fait sur le serveur Discord principal.', ...EPH });
  }
  const modal = new ModalBuilder().setCustomId('verif_pseudo').setTitle('Vérification Roblox')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pseudo').setLabel('Ton pseudo Roblox (exactement)')
        .setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true),
    ));
  return i.showModal(modal);
}

async function terminer(i, compte, edition) {
  const res = await verification.finaliser(i.guild, i.member, compte, 'code');
  const embed = new EmbedBuilder().setColor(COULEURS.unmute).setTitle('✅ Compte vérifié')
    .setDescription(
      `Ton compte Roblox **${compte.nom}** est vérifié.\n` +
      (res.renomme ? `Ton pseudo Discord est maintenant **${compte.nom}**.` : "Je n'ai pas pu changer ton pseudo Discord (mon rôle est plus bas que le tien) : change-le toi-même en **" + compte.nom + '**.') +
      (res.roles === false ? "\n⚠️ Je n'ai pas pu mettre à jour tes rôles (mon rôle est plus bas que les leurs) : préviens le staff." : '') +
      (config.VERIF.preuve === 'code' ? '\nTu peux maintenant retirer le code de ta description Roblox.' : ''),
    );
  return edition ? i.editReply({ embeds: [embed], components: [] }) : i.editReply({ embeds: [embed] });
}

async function recevoirPseudo(i) {
  if (i.guild.id !== PRINCIPAL()) return i.reply({ content: '❌ La vérification se fait sur le serveur Discord principal.', ...EPH });
  const pseudo = i.fields.getTextInputValue('pseudo').trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(pseudo)) {
    return i.reply({ content: '❌ Pseudo Roblox invalide (3 à 20 caractères : lettres, chiffres, _).', ...EPH });
  }
  await i.deferReply(EPH);

  const compte = await compteRobloxExact(pseudo);
  if (!compte) return i.editReply("❌ Aucun compte Roblox actif ne porte exactement ce pseudo. Vérifie l'orthographe.");

  const deja = await base.getVerificationParRoblox(String(compte.id));
  if (deja && deja.discord_id !== i.user.id) {
    return i.editReply("❌ Ce compte Roblox est déjà vérifié par un autre membre. Si c'est bien le tien, contacte le staff.");
  }

  if (config.VERIF.preuve === 'aucune') {
    try { return await terminer(i, compte, false); } catch { return i.editReply('❌ Enregistrement impossible, réessaie.'); }
  }

  const code = verification.preparer(i.user.id, compte);
  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle(`Dernière étape pour ${compte.nom}`)
    .setDescription(
      `Le compte **${compte.nom}** existe. Il faut prouver qu'il est à toi :\n\n` +
      `1️⃣ Ouvre ton profil Roblox et colle ce code dans ta **description** (« À propos de moi ») :\n**\`${code}\`**\n` +
      '2️⃣ Enregistre, puis clique sur **J\'ai mis le code**.\n\n' +
      `Le code est valable ${config.VERIF.codeValiditeMin} minutes.`,
    );
  return i.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(bouton('verif_ok', "J'ai mis le code", '🔑', ButtonStyle.Primary))] });
}

async function verifierCode(i) {
  if (i.guild.id !== PRINCIPAL()) return i.reply({ content: '❌ La vérification se fait sur le serveur Discord principal.', ...EPH });
  await i.deferUpdate();
  const r = await verification.controlerCode(i.user.id);
  if (!r.ok) return i.followUp({ content: `❌ ${r.erreur}`, ...EPH });
  const deja = await base.getVerificationParRoblox(String(r.compte.id));
  if (deja && deja.discord_id !== i.user.id) {
    return i.followUp({ content: '❌ Ce compte Roblox vient d\'être vérifié par un autre membre.', ...EPH });
  }
  try {
    return await terminer(i, r.compte, true);
  } catch {
    return i.followUp({ content: '❌ Enregistrement impossible, réessaie.', ...EPH });
  }
}

/* ---------- Côté staff ---------- */
function panneau(i) {
  const code = config.VERIF.preuve === 'code';
  if (oauth.mode() === 'oauth') {
    const embedOauth = new EmbedBuilder().setColor(COULEURS.info).setTitle('✅ Vérification Roblox')
      .setDescription(
        'Pour jouer et rester sur nos serveurs, vérifie ton compte Roblox.\n\n' +
        '1️⃣ Clique sur **Se vérifier**.\n' +
        '2️⃣ Clique sur **Se connecter avec Roblox** : tu arrives sur la page officielle de Roblox, où tu autorises la connexion (ton mot de passe n\'est jamais communiqué).\n' +
        '3️⃣ Ton pseudo Discord devient ton pseudo Roblox.\n\n' +
        '⚠️ En jeu, un compte non vérifié est expulsé du serveur.',
      );
    return i.channel.send({ embeds: [embedOauth], components: [new ActionRowBuilder().addComponents(bouton('verif_start', 'Se vérifier', '✅'))] });
  }
  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('✅ Vérification Roblox')
    .setDescription(
      'Pour jouer et rester sur nos serveurs, vérifie ton compte Roblox.\n\n' +
      '1️⃣ Clique sur **Se vérifier** et tape ton pseudo Roblox exact.\n' +
      (code ? '2️⃣ Je contrôle que le compte existe et je te donne un code à coller dans la **description** de ton profil Roblox.\n3️⃣ Clique sur **J\'ai mis le code**.\n' : '2️⃣ Je contrôle que le compte existe.\n') +
      `${code ? '4️⃣' : '3️⃣'} Ton pseudo Discord devient ton pseudo Roblox.\n\n` +
      '⚠️ En jeu, un compte non vérifié est expulsé du serveur.',
    );
  return i.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(bouton('verif_start', 'Se vérifier', '✅'))] });
}

async function statut(i) {
  await i.deferReply(EPH);
  const total = await base.countVerifications();
  const actif = (await base.getSetting(i.guild.id, 'verification_jeu')) === 'on';
  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('📋 Vérification Roblox')
    .addFields(
      { name: 'Comptes vérifiés', value: String(total), inline: true },
      { name: 'Méthode', value: oauth.mode() === 'oauth' ? 'Connexion Roblox (OAuth)' : (config.VERIF.preuve === 'code' ? 'Code dans la description Roblox' : 'Aucune (le compte doit exister)'), inline: true },
      { name: 'Rôles', value: `Nouveau membre : ${config.VERIF.roleNonVerifie ? `<@&${config.VERIF.roleNonVerifie}>` : '—'}\nAprès vérification : ${config.VERIF.roleSansPapier ? `<@&${config.VERIF.roleSansPapier}>` : '—'}\nAnnonces : ${config.VERIF.salonVerifications ? `<#${config.VERIF.salonVerifications}>` : '—'}`, inline: false },
      { name: 'Expulsion en jeu', value: actif ? `✅ Activée (avertissement, puis expulsion après ${config.VERIF.kickJeu.delaiAvantKickSec} s)` : '❌ Désactivée' , inline: false },
    );
  embed.addFields({
    name: 'Connexion Roblox (OAuth)',
    value: oauth.configure()
      ? `✅ Configurée.\nURL de redirection à enregistrer chez Roblox :\n\`${oauth.urlRedirection()}\``
      : '❌ Non configurée : ajoute `ROBLOX_CLIENT_ID` et `ROBLOX_CLIENT_SECRET` sur Render (et une adresse publique en HTTPS). En attendant, la méthode du code est utilisée.',
  });
  if (erlc.configure()) {
    try {
      const e = await verification.evaluerJoueurs(i.client);
      if (e) {
        embed.addFields({
          name: 'Joueurs en jeu en ce moment',
          value: `${e.total} contrôlé(s), **${e.nonVerifies.length}** non vérifié(s)` +
            (e.nonVerifies.length ? `\n${e.nonVerifies.slice(0, 15).map(j => `• ${j.nom}`).join('\n')}` : ''),
        });
      }
    } catch (err) {
      embed.addFields({ name: 'Joueurs en jeu', value: `Lecture impossible : ${err.message}`.slice(0, 500) });
    }
  }
  return i.editReply({ embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Vérification des comptes Roblox : panneau, expulsion en jeu, statut')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('panneau').setDescription('Poste le panneau « Se vérifier » dans ce salon'))
    .addSubcommand(s => s.setName('jeu').setDescription("Active ou coupe l'expulsion en jeu des comptes Roblox non vérifiés")
      .addBooleanOption(o => o.setName('actif').setDescription('Expulsion activée ?').setRequired(true)))
    .addSubcommand(s => s.setName('statut').setDescription('Comptes vérifiés, réglages et joueurs non vérifiés actuellement en jeu'))
    .addSubcommand(s => s.setName('retirer').setDescription("Retire la vérification d'un membre (il devra se revérifier)")
      .addUserOption(o => o.setName('membre').setDescription('Le membre').setRequired(true))),

  async execute(i) {
    if (niveau(i.member) < niveauRequis()) {
      return i.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ...EPH });
    }
    if (i.guild.id !== PRINCIPAL()) {
      return i.reply({ content: "❌ Cette commande s'utilise sur le serveur Discord principal.", ...EPH });
    }
    const sub = i.options.getSubcommand();

    if (sub === 'panneau') {
      try { await panneau(i); } catch { return i.reply({ content: "❌ Je ne peux pas écrire dans ce salon (permissions du bot ?).", ...EPH }); }
      return i.reply({ content: '✅ Panneau de vérification posté dans ce salon.', ...EPH });
    }
    if (sub === 'jeu') {
      const actif = i.options.getBoolean('actif');
      if (actif && (await base.countVerifications()) === 0) {
        return i.reply({ content: "❌ Aucun compte n'est encore vérifié : l'activer expulserait tout le monde. Poste d'abord le panneau avec `/verification panneau`.", ...EPH });
      }
      await base.setSetting(i.guild.id, 'verification_jeu', actif ? 'on' : 'off');
      return i.reply(actif
        ? `✅ Expulsion en jeu **activée** : les comptes non vérifiés reçoivent un MP puis sont expulsés après ${config.VERIF.kickJeu.delaiAvantKickSec} s.`
        : "✅ Expulsion en jeu **désactivée**.");
    }
    if (sub === 'statut') return statut(i);

    const user = i.options.getUser('membre');
    const v = await base.getVerificationParDiscord(user.id);
    if (!v) return i.reply({ content: "❌ Ce membre n'est pas vérifié.", ...EPH });
    await base.deleteVerification(user.id);
    const membre = await i.guild.members.fetch(user.id).catch(() => null);
    const roles = membre ? await verification.passerNonVerifie(membre, 'Vérification retirée par le staff') : null;
    return i.reply(`✅ Vérification de ${user} retirée (compte Roblox **${v.roblox_name}**). Il devra se revérifier${roles === true ? ' : il a retrouvé le rôle « non vérifié ».' : roles === false ? " (je n'ai pas pu changer ses rôles)." : '.'}`);
  },

  buttons: { verif_start: demarrer, verif_ok: verifierCode },
  modals: { verif_pseudo: recevoirPseudo },
};
