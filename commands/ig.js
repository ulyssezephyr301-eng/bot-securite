const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const erlc = require('../erlc');
const { nomsRoblox } = require('../roblox');
const { EPH, COULEURS, niveau, envoyerLog, envoyerSanctionLog } = require('../utils');

// Niveau minimum par action (config.js > NIVEAU_MIN), avec une valeur par défaut si la ligne manque
const DEFAUTS = { ig: 1, igMessage: 1, igKick: 2, igBan: 3, igUnban: 3, igCommande: 5, igDiagnostic: 5 };
const ACTION_DE = {
  serveur: 'ig', joueurs: 'ig', staff: 'ig', file: 'ig',
  h: 'igMessage', m: 'igMessage', pm: 'igMessage',
  kick: 'igKick', ban: 'igBan', unban: 'igUnban', commande: 'igCommande', diagnostic: 'igDiagnostic',
};
const niveauRequis = (action) => config.NIVEAU_MIN[action] ?? DEFAUTS[action];

// Limite de kick / ban en jeu par membre du staff (hors Fondateur), contre un compte piraté ou un abus
const historiqueSanctions = new Map();
function limiteAtteinte(userId) {
  const cfg = config.ABUS_STAFF;
  if (!cfg.actif) return false;
  const now = Date.now();
  const liste = (historiqueSanctions.get(userId) ?? []).filter(t => now - t < cfg.fenetreMs);
  if (liste.length >= cfg.max) { historiqueSanctions.set(userId, liste); return true; }
  liste.push(now);
  historiqueSanctions.set(userId, liste);
  return false;
}

const optJoueur = (o, description) => o.setName('joueur').setDescription(description)
  .setRequired(true).setAutocomplete(true).setMaxLength(20);
const optMessage = (o, description) => o.setName('message').setDescription(description)
  .setRequired(true).setMaxLength(200);

/* ---------- Mise en forme ---------- */
const lienProfil = (id, nom) => `[${nom ?? id}](https://www.roblox.com/users/${id}/profile)`;

// Découpe des lignes en blocs qui tiennent dans un champ d'embed
function blocs(lignes, max = 1000) {
  const res = [];
  let cur = '';
  for (const l of lignes) {
    if (cur && (cur + '\n' + l).length > max) { res.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) res.push(cur);
  return res;
}

const ROLES_JEU = {
  'Server Owner': '👑 Propriétaire',
  'Server Co-Owner': '👑 Co-propriétaire',
  'Server Administrator': '🛡️ Admin',
  'Server Moderator': '🔰 Modérateur',
};

/* ---------- Sous-commandes d'information ---------- */
async function infosServeur(i) {
  const d = await erlc.serveur();
  const noms = await nomsRoblox([d.OwnerId, ...(d.CoOwnerIds ?? [])]);
  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle(`🎮 ${d.Name ?? 'Serveur ER:LC'}`)
    .addFields(
      { name: 'Joueurs en jeu', value: `**${d.CurrentPlayers ?? 0}** / ${d.MaxPlayers ?? '?'}`, inline: true },
      { name: 'Code du serveur', value: d.JoinKey ? `\`${d.JoinKey}\`` : '—', inline: true },
      { name: 'Propriétaire', value: d.OwnerId ? lienProfil(d.OwnerId, noms.get(String(d.OwnerId))) : '—', inline: true },
    );
  if (d.CoOwnerIds?.length) {
    embed.addFields({ name: `Co-propriétaires (${d.CoOwnerIds.length})`, value: d.CoOwnerIds.map(id => lienProfil(id, noms.get(String(id)))).join(', ').slice(0, 1000) });
  }
  if (d.AccVerifiedReq !== undefined) embed.addFields({ name: 'Compte vérifié requis', value: String(d.AccVerifiedReq), inline: true });
  if (d.TeamBalance !== undefined) embed.addFields({ name: 'Équilibrage des équipes', value: d.TeamBalance ? 'Oui' : 'Non', inline: true });
  return i.editReply({ embeds: [embed] });
}

async function listeJoueurs(i) {
  const d = await erlc.serveur({ players: true }, { ttlMs: 5000 });
  const joueurs = (d.Players ?? []).map(erlc.parseJoueur);
  const embed = new EmbedBuilder().setColor(COULEURS.info)
    .setTitle(`👥 Joueurs en jeu (${joueurs.length}${d.MaxPlayers ? `/${d.MaxPlayers}` : ''})`);
  if (!joueurs.length) {
    embed.setDescription('Aucun joueur en jeu pour le moment.');
    return i.editReply({ embeds: [embed] });
  }
  const parEquipe = new Map();
  for (const j of joueurs) {
    if (!parEquipe.has(j.equipe)) parEquipe.set(j.equipe, []);
    parEquipe.get(j.equipe).push(j);
  }
  let nbChamps = 0;
  for (const [equipe, liste] of [...parEquipe.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const lignes = liste.sort((a, b) => a.nom.localeCompare(b.nom)).map(j => {
      const role = ROLES_JEU[j.permission] ? ` — ${ROLES_JEU[j.permission]}` : '';
      return `• **${j.nom}**${j.indicatif ? ` (${j.indicatif})` : ''}${role}`;
    });
    for (const [n, texte] of blocs(lignes).entries()) {
      if (nbChamps >= 24) break;
      embed.addFields({ name: n === 0 ? `${equipe} (${liste.length})` : '\u200b', value: texte });
      nbChamps++;
    }
  }
  return i.editReply({ embeds: [embed] });
}

async function listeStaff(i) {
  const d = await erlc.serveur({ staff: true }, { ttlMs: 30_000 });
  const staff = d.Staff ?? {};
  const TITRES = { CoOwners: 'Co-propriétaires', Admins: 'Administrateurs', Mods: 'Modérateurs', Helpers: 'Helpers' };

  // Les listes d'IDs sont converties en pseudos
  const ids = [];
  for (const v of Object.values(staff)) if (Array.isArray(v)) ids.push(...v);
  const noms = await nomsRoblox(ids);

  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('🛡️ Staff du serveur ER:LC');
  let total = 0;
  for (const [cle, valeur] of Object.entries(staff)) {
    let lignes = [];
    if (Array.isArray(valeur)) lignes = valeur.map(id => `• ${lienProfil(id, noms.get(String(id)))}`);
    else if (valeur && typeof valeur === 'object') lignes = Object.entries(valeur).map(([id, nom]) => `• ${lienProfil(id, nom)}`);
    if (!lignes.length) continue;
    total += lignes.length;
    for (const [n, texte] of blocs(lignes).entries()) {
      embed.addFields({ name: n === 0 ? `${TITRES[cle] ?? cle} (${lignes.length})` : '\u200b', value: texte });
    }
  }
  if (!total) embed.setDescription('Aucun membre du staff renvoyé par l\'API.');
  return i.editReply({ embeds: [embed] });
}

async function listeFile(i) {
  const d = await erlc.serveur({ queue: true }, { ttlMs: 5000 });
  const file = Array.isArray(d.Queue) ? d.Queue : [];
  const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle(`⏳ File d'attente (${file.length})`);
  if (!file.length) {
    embed.setDescription("Personne n'attend pour rejoindre le serveur.");
    return i.editReply({ embeds: [embed] });
  }
  const noms = await nomsRoblox(file.slice(0, 50));
  const lignes = file.slice(0, 50).map((id, n) => `${n + 1}. ${lienProfil(id, noms.get(String(id)))}`);
  blocs(lignes).forEach((texte, n) => embed.addFields({ name: n === 0 ? 'Dans l\'ordre d\'arrivée' : '\u200b', value: texte }));
  if (file.length > 50) embed.setFooter({ text: `Affichage des 50 premiers sur ${file.length}` });
  return i.editReply({ embeds: [embed] });
}

/* ---------- Messages en jeu ---------- */
async function messageGeneral(i, prefixe, nom) {
  const texte = erlc.nettoyerMessage(i.options.getString('message'));
  if (!texte) return i.editReply('❌ Le message est vide.');
  await erlc.envoyerCommande(`:${prefixe} ${texte}`);
  return i.editReply(`✅ Message envoyé en jeu (\`:${prefixe}\` — ${nom}) :\n> ${texte}`);
}

async function messagePrive(i) {
  const joueur = erlc.validerJoueur(i.options.getString('joueur'));
  if (!joueur) return i.editReply('❌ Pseudo Roblox invalide (3 à 20 caractères : lettres, chiffres, _).');
  const texte = erlc.nettoyerMessage(i.options.getString('message'));
  if (!texte) return i.editReply('❌ Le message est vide.');
  await erlc.envoyerCommande(`:pm ${joueur} ${texte}`);
  return i.editReply(`✅ Message privé envoyé à **${joueur}** :\n> ${texte}`);
}

/* ---------- Sanctions en jeu ---------- */
async function journalSanction(i, titre, joueur, etat) {
  await envoyerSanctionLog(i.guild, new EmbedBuilder().setColor(COULEURS.kick)
    .setTitle(`🎮 ${titre}`)
    .addFields(
      { name: 'Joueur (Roblox)', value: joueur, inline: true },
      { name: 'Modérateur', value: `${i.user}`, inline: true },
      ...(etat ? [{ name: 'État', value: etat, inline: true }] : []),
    ).setTimestamp());
}

async function sanctionJeu(i, type) {
  const joueur = erlc.validerJoueur(i.options.getString('joueur'));
  if (!joueur) return i.editReply('❌ Pseudo Roblox invalide (3 à 20 caractères : lettres, chiffres, _).');

  if (type !== 'unban' && niveau(i.member) < 5 && limiteAtteinte(i.user.id)) {
    await envoyerLog(i.guild, new EmbedBuilder().setColor(COULEURS.alerte)
      .setTitle('🚨 Limite de sanctions en jeu atteinte')
      .setDescription(`${i.user} a atteint la limite de ${config.ABUS_STAFF.max} kick/ban en jeu en ${Math.round(config.ABUS_STAFF.fenetreMs / 60000)} min. La commande a été **bloquée**.`)
      .setTimestamp(), true);
    return i.editReply('❌ Trop de sanctions en peu de temps : par sécurité, un Fondateur doit intervenir.');
  }

  if (type === 'kick') {
    await erlc.envoyerCommande(`:kick ${joueur}`);
    await journalSanction(i, 'Expulsion en jeu', joueur, null);
    return i.editReply(`✅ **${joueur}** a été expulsé du serveur ER:LC.`);
  }

  const verbe = type === 'ban' ? 'Ban' : 'Unban';
  const etat = await erlc.executerOuAttendre(i.guild, `:${type} ${joueur}`, `${verbe} en jeu de ${joueur}`);
  await journalSanction(i, `${verbe} en jeu`, joueur, etat === 'attente' ? 'En attente (serveur vide)' : 'Envoyé');
  if (etat === 'attente') {
    return i.editReply(`🕒 Le serveur ER:LC est vide : le ${verbe.toLowerCase()} de **${joueur}** est mis en attente et sera appliqué dès qu'un joueur se connecte.`);
  }
  return i.editReply(type === 'ban'
    ? `✅ **${joueur}** a été banni du serveur ER:LC (en jeu seulement : pour bannir aussi sur Discord, utilise \`/sanction-ban\`).`
    : `✅ **${joueur}** a été débanni du serveur ER:LC.`);
}

/* ---------- Commande libre (Fondateur) ---------- */
async function commandeLibre(i) {
  const commande = erlc.normaliserCommande(i.options.getString('texte'));
  if (!commande) return i.editReply('❌ La commande est vide.');
  if (erlc.commandeBloquee(commande)) {
    return i.editReply(`❌ Cette commande est bloquée (octroi de grades, sanctions, arrêt du serveur) : utilise la commande dédiée, par exemple \`/ig ban\`.`);
  }
  const res = await erlc.envoyerCommande(commande);
  return i.editReply(`✅ Commande envoyée : \`${commande}\`${res?.message ? `\nRéponse de l'API : ${String(res.message).slice(0, 300)}` : ''}`);
}

/* ---------- Diagnostic de la liaison (Fondateur) ---------- */
async function diagnostic(i) {
  const d = await erlc.diagnostic();
  const embed = new EmbedBuilder()
    .setColor(d.test?.ok ? COULEURS.unmute : COULEURS.alerte)
    .setTitle('🔧 Diagnostic de la liaison ER:LC');
  if (!d.cle.presente) {
    embed.addFields({ name: 'Clé API', value: '❌ Absente : la variable `ERLC_API_KEY` est vide ou mal nommée sur Render (ou le service n\'a pas été redéployé après l\'ajout).' });
  } else {
    embed.addFields({
      name: 'Clé API',
      value: `Présente (${d.cle.longueur} caractères).` + (d.cle.nettoyee ? '\n⚠️ Des espaces, guillemets ou un préfixe (ex : `ERLC_API_KEY=`) ont été retirés automatiquement : corrige quand même la valeur sur Render.' : ''),
    });
    embed.addFields(
      { name: 'Adresse utilisée', value: d.base ?? '—', inline: true },
      {
        name: 'Test de connexion',
        value: d.test.ok
          ? `✅ Réussi : « ${d.test.nom ?? 'serveur'} », ${d.test.joueurs ?? 0}/${d.test.maxJoueurs ?? '?'} joueurs.`
          : `❌ ${d.test.message}`,
      },
    );

    // Commandes : elles demandent une autorisation en plus de la clé (IP de confiance)
    const c = d.commandes;
    const quand = c.t ? ` (<t:${Math.floor(c.t / 1000)}:R>)` : '';
    let etat = "Aucune commande envoyée depuis le démarrage du bot. Fais par exemple `/ig m` pour tester.";
    if (c.ok === true) etat = `✅ La dernière commande a été acceptée${quand}.`;
    if (c.ok === false) etat = `❌ Dernière commande refusée${quand} : ${c.message}`;
    embed.addFields({ name: 'Envoi de commandes', value: String(etat).slice(0, 1000) });
    embed.addFields({
      name: 'Adresse IP du bot',
      value: d.ip
        ? `\`${d.ip}\`\nSi les commandes sont refusées (code 4000), le **propriétaire** du serveur ER:LC doit ajouter cette adresse sur https://api.erlc.gg/server-owners (onglet « Settings » du serveur, liste des IP de confiance). Sur Render, l'adresse peut changer : elle vient d'une plage partagée.`
        : "Impossible de la déterminer pour le moment.",
    });
  }
  return i.editReply({ embeds: [embed] });
}

/* ---------- Définition ---------- */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ig')
    .setDescription("Commandes en jeu : contrôle du serveur ER:LC via l'API")
    .setDMPermission(false)
    .addSubcommand(s => s.setName('serveur').setDescription('Fiche du serveur ER:LC : nom, code, joueurs connectés, capacité, propriétaire'))
    .addSubcommand(s => s.setName('joueurs').setDescription('Liste des joueurs en jeu, classés par équipe, avec indicatif et rôle'))
    .addSubcommand(s => s.setName('staff').setDescription('Staff du serveur ER:LC : co-propriétaires, administrateurs, modérateurs'))
    .addSubcommand(s => s.setName('file').setDescription("File d'attente : joueurs qui attendent de rejoindre le serveur, dans l'ordre"))
    .addSubcommand(s => s.setName('h').setDescription("Message d'information (:h) envoyé à tous les joueurs en jeu")
      .addStringOption(o => optMessage(o, 'Texte envoyé à tous les joueurs (200 caractères maximum)')))
    .addSubcommand(s => s.setName('m').setDescription("Message d'annonce (:m) envoyé à tous les joueurs en jeu")
      .addStringOption(o => optMessage(o, 'Texte envoyé à tous les joueurs (200 caractères maximum)')))
    .addSubcommand(s => s.setName('pm').setDescription('Message privé (:pm) envoyé à un seul joueur en jeu, désigné par son pseudo Roblox')
      .addStringOption(o => optJoueur(o, 'Pseudo Roblox du joueur connecté (suggestions automatiques)'))
      .addStringOption(o => optMessage(o, 'Texte du message privé (200 caractères maximum)')))
    .addSubcommand(s => s.setName('kick').setDescription('Expulse un joueur du serveur ER:LC (:kick) ; il peut revenir. Sans effet sur Discord')
      .addStringOption(o => optJoueur(o, 'Pseudo Roblox du joueur connecté (suggestions automatiques)')))
    .addSubcommand(s => s.setName('ban').setDescription('Bannit un joueur du serveur ER:LC (:ban), en jeu seulement. Pour Discord aussi : /sanction-ban')
      .addStringOption(o => optJoueur(o, 'Pseudo Roblox exact du joueur (connecté ou non)')))
    .addSubcommand(s => s.setName('unban').setDescription('Débannit un joueur du serveur ER:LC (:unban), par son pseudo Roblox ou son ID')
      .addStringOption(o => optJoueur(o, 'Pseudo Roblox exact ou ID Roblox du joueur banni')))
    .addSubcommand(s => s.setName('diagnostic').setDescription('Fondateur : teste la liaison avec ER:LC (clé, serveur) et explique le problème trouvé'))
    .addSubcommand(s => s.setName('commande').setDescription('Fondateur : exécute une commande ER:LC libre (ex : :time 12). Certaines sont bloquées')
      .addStringOption(o => o.setName('texte').setDescription('Commande complète, avec ou sans « : » au début (200 caractères maximum)').setRequired(true).setMaxLength(200))),

  async execute(i) {
    const sub = i.options.getSubcommand();
    if (i.guild.id !== config.ERLC.GUILD_ID) {
      return i.reply({ content: '❌ Les commandes en jeu ne sont disponibles que sur le serveur Discord principal.', ...EPH });
    }
    if (niveau(i.member) < niveauRequis(ACTION_DE[sub])) {
      return i.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ...EPH });
    }
    if (sub !== 'diagnostic' && !erlc.configure()) {
      return i.reply({ content: "❌ L'API ER:LC n'est pas configurée (variable ERLC_API_KEY manquante sur Render). Fais /ig diagnostic.", ...EPH });
    }

    // Réponses visibles par tout le salon, sauf le diagnostic (adresse IP, état de la clé)
    await i.deferReply(sub === 'diagnostic' ? EPH : undefined);
    try {
      switch (sub) {
        case 'serveur': return await infosServeur(i);
        case 'joueurs': return await listeJoueurs(i);
        case 'staff': return await listeStaff(i);
        case 'file': return await listeFile(i);
        case 'h': return await messageGeneral(i, 'h', 'information');
        case 'm': return await messageGeneral(i, 'm', 'annonce');
        case 'pm': return await messagePrive(i);
        case 'kick': return await sanctionJeu(i, 'kick');
        case 'ban': return await sanctionJeu(i, 'ban');
        case 'unban': return await sanctionJeu(i, 'unban');
        case 'commande': return await commandeLibre(i);
        case 'diagnostic': return await diagnostic(i);
      }
    } catch (err) {
      if (err instanceof erlc.ErlcError) return i.editReply(`❌ ${err.message}`);
      throw err;
    }
  },

  // Suggestions : pseudos des joueurs actuellement en jeu
  async autocomplete(i) {
    const focus = i.options.getFocused(true);
    if (focus.name !== 'joueur' || i.guild?.id !== config.ERLC.GUILD_ID
        || niveau(i.member) < niveauRequis('ig') || !erlc.configure()) {
      return i.respond([]);
    }
    try {
      const d = await erlc.serveur({ players: true }, { ttlMs: 10_000, timeoutMs: 2000 });
      const q = String(focus.value ?? '').toLowerCase();
      const choix = (d.Players ?? []).map(erlc.parseJoueur)
        .filter(j => j.nom.toLowerCase().includes(q))
        .slice(0, 25)
        .map(j => ({ name: `${j.nom} (${j.equipe})`.slice(0, 100), value: j.nom }));
      return i.respond(choix);
    } catch {
      return i.respond([]);
    }
  },
};
