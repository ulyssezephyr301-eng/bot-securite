const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { EPH, niveau, formatDuree } = require('../utils');

const GRADES = { 1: 'Guide', 2: 'Modérateur', 3: 'Administrateur', 4: 'Exécutif', 5: 'Fondateur' };

// Niveau minimum par défaut si une ligne manque dans config.js > NIVEAU_MIN
const DEFAUTS = {
  ig: 1, igMessage: 1, igKick: 2, igBan: 3, igUnban: 3, igCommande: 5, igDiagnostic: 5,
  mots: 3, publierCommandes: 3, reseau: 5, aide: 1,
};
const niveauAction = (action) => config.NIVEAU_MIN[action] ?? DEFAUTS[action];
const nomGrade = (n) => (n ? (n >= 5 ? GRADES[5] : `${GRADES[n]} et +`) : null);
const grade = (action) => nomGrade(niveauAction(action));
const NIVEAU_AIDE = () => niveauAction('aide');

// Catégories de modération : [commande, action (ou table sous-commande -> action), sous-commandes à afficher]
const CATEGORIES = [
  {
    titre: '⚖️ Sanctions',
    cmds: [
      ['sanction-note', 'note'], ['sanction-warn', 'warn'], ['sanction-mute', 'mute'], ['sanction-unmute', 'unmute'],
      ['sanction-expulser', 'kick'], ['sanction-ban', 'ban'], ['sanction-unban', 'unban'],
    ],
  },
  { titre: '📨 Demandes de sanction', cmds: [['demande-sanction', 'demande']] },
  { titre: '📋 Suivi des joueurs', cmds: [['sanction', { voir: 'voirSanctions', 'mute-actif': 'voirSanctions' }], ['info-joueur', 'infoJoueur']] },
  { titre: '🧹 Gestion des salons', cmds: [['clear', 'clear'], ['lockdown', 'lockdown'], ['unlock', 'lockdown'], ['slowmode', 'lockdown']] },
  { titre: '⚙️ Configuration et réseau', cmds: [['config', 'config'], ['mots', 'mots'], ['reseau', 'reseau']] },
  { titre: '📖 Aide', cmds: [['commandes', 'aide']] },
];

// Commandes en jeu : [action de grade, explication précise]
const GROUPES_IG = [
  {
    titre: '📊 Informations sur le serveur ER:LC',
    cmds: {
      serveur: ['ig', 'Fiche du serveur : nom, code de connexion, joueurs connectés sur la capacité, propriétaire et co-propriétaires.'],
      joueurs: ['ig', 'Tous les joueurs actuellement en jeu, classés par équipe, avec leur indicatif et leur rôle (staff ou joueur).'],
      staff: ['ig', 'Le staff du serveur ER:LC : co-propriétaires, administrateurs et modérateurs.'],
      file: ['ig', "La file d'attente : les joueurs qui attendent de rejoindre le serveur, dans l'ordre d'arrivée."],
    },
  },
  {
    titre: '📢 Messages en jeu',
    cmds: {
      h: ['igMessage', "Envoie un message d'information (:h) à tous les joueurs en jeu. Ex : /ig h message:Redémarrage dans 5 minutes."],
      m: ['igMessage', "Envoie un message d'annonce (:m) à tous les joueurs en jeu."],
      pm: ['igMessage', 'Envoie un message privé (:pm) à un seul joueur. Tape son pseudo Roblox : les joueurs connectés te sont proposés.'],
    },
  },
  {
    titre: '🔨 Sanctions en jeu',
    cmds: {
      kick: ['igKick', 'Expulse un joueur du serveur ER:LC (:kick). Il peut revenir tout de suite. Sans effet sur Discord.'],
      ban: ['igBan', 'Bannit un joueur du serveur ER:LC (:ban) par son pseudo Roblox, en jeu seulement. Pour bannir aussi sur Discord, utilise /sanction-ban.'],
      unban: ['igUnban', 'Débannit un joueur du serveur ER:LC (:unban) par son pseudo Roblox ou son ID.'],
    },
  },
  {
    titre: '⚙️ Avancé',
    cmds: {
      diagnostic: ['igDiagnostic', 'Teste la liaison avec ER:LC (clé API, serveur, envoi de commandes) et explique le problème trouvé.'],
      commande: ['igCommande', "Exécute n'importe quelle commande ER:LC, par exemple :time 12. Les commandes qui donnent des grades en jeu, ban, kick et shutdown sont bloquées."],
    },
  },
];

// Résumé par grade : [action, libellé]
const CAPACITES = [
  ['aide', '/commandes'],
  ['note', '/sanction-note'],
  ['warn', '/sanction-warn'],
  ['demande', '/demande-sanction'],
  ['voirSanctions', '/sanction voir et mute-actif'],
  ['infoJoueur', '/info-joueur'],
  ['clear', '/clear'],
  ['lockdown', '/lockdown, /unlock, /slowmode'],
  ['ig', '/ig serveur, joueurs, staff, file'],
  ['igMessage', '/ig h, m, pm'],
  ['mute', '/sanction-mute'],
  ['unmute', '/sanction-unmute'],
  ['igKick', '/ig kick'],
  ['kick', '/sanction-expulser'],
  ['ban', '/sanction-ban'],
  ['unban', '/sanction-unban'],
  ['igBan', '/ig ban'],
  ['igUnban', '/ig unban'],
  ['valider', 'accepter ou refuser les demandes'],
  ['delsanction', 'supprimer une sanction (🗑️)'],
  ['mots', '/mots'],
  ['publierCommandes', '/commandes publier'],
  ['config', '/config (tout)'],
  ['igCommande', '/ig commande'],
  ['igDiagnostic', '/ig diagnostic'],
  ['reseau', '/reseau synchroniser'],
];

/* ---------- Commandes cliquables ---------- */
let cacheIds = null;
let cacheDate = 0;
async function idsCommandes(client) {
  if (cacheIds && Date.now() - cacheDate < 10 * 60_000) return cacheIds;
  try {
    const cmds = await client.application.commands.fetch();
    cacheIds = new Map(cmds.map(c => [c.name, c.id]));
    cacheDate = Date.now();
  } catch (err) {
    console.error('Impossible de récupérer les IDs des commandes :', err.message);
    cacheIds = cacheIds ?? new Map();
  }
  return cacheIds;
}

// </nom:id> = commande cliquable ; sinon simple texte
function mention(ids, nom, sous = null) {
  const texte = sous ? `${nom} ${sous}` : nom;
  const id = ids.get(nom);
  return id ? `</${texte}:${id}>` : `\`/${texte}\``;
}

// Lignes d'une commande de modération, construites à partir des vraies commandes du bot
function lignes(client, ids, nom, action, subsFiltre = null) {
  const cmd = client.commands.get(nom);
  if (!cmd) return [];
  const json = cmd.data.toJSON();
  const suffixe = (act) => { const g = act ? grade(act) : null; return g ? ` — **${g}**` : ''; };

  const toutesSubs = (json.options ?? []).filter(o => o.type === 1);
  if (toutesSubs.length) {
    return toutesSubs
      .filter(o => !subsFiltre || subsFiltre.includes(o.name))
      .map(o => {
        const act = action && typeof action === 'object' ? action[o.name] : action;
        return `${mention(ids, nom, o.name)} — ${o.description}${suffixe(act)}`;
      });
  }
  return [`${mention(ids, nom)} — ${json.description}${suffixe(action)}`];
}

/* ---------- Message 1 : modération ---------- */
function embedModeration(client, ids) {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🛡️ Commandes de modération')
    .setDescription('Le grade indiqué après chaque commande est le **minimum requis**. Les commandes en jeu (ER:LC) sont dans le message suivant, le résumé par grade et les règles dans le dernier.');

  const connues = new Set(['ig']);
  for (const cat of CATEGORIES) {
    const l = cat.cmds.flatMap(([nom, action, subs]) => { connues.add(nom); return lignes(client, ids, nom, action, subs); });
    if (l.length) embed.addFields({ name: cat.titre, value: l.join('\n').slice(0, 1024) });
  }

  // Commandes ajoutées plus tard et pas encore classées
  const autres = [...client.commands.keys()].filter(n => !connues.has(n)).flatMap(n => lignes(client, ids, n, null));
  if (autres.length) embed.addFields({ name: '➕ Autres', value: autres.join('\n').slice(0, 1024) });
  return embed;
}

/* ---------- Message 2 : commandes en jeu ---------- */
function embedJeu(ids) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎮 Commandes en jeu (ER:LC)')
    .setDescription(
      "Toutes les commandes `/ig` pilotent le serveur ER:LC depuis Discord grâce à l'API. " +
      'Elles ne marchent que sur le serveur Discord principal. Le grade est le **minimum requis**.',
    );

  for (const groupe of GROUPES_IG) {
    const l = Object.entries(groupe.cmds).map(([sub, [action, texte]]) => {
      const g = grade(action);
      return `${mention(ids, 'ig', sub)} — ${texte}${g ? ` — **${g}**` : ''}`;
    });
    embed.addFields({ name: groupe.titre, value: l.join('\n').slice(0, 1024) });
  }

  embed.addFields({
    name: 'ℹ️ À savoir',
    value:
      '• Pour `/ig pm`, `kick`, `ban` et `unban`, le bot propose les joueurs connectés quand tu tapes un pseudo.\n' +
      '• Un `/sanction-ban` sur le Discord principal bannit aussi le joueur **en jeu** (pseudo Roblox lu depuis son pseudo Bloxlink, ou option `roblox`). `/sanction-unban` le débannit en jeu.\n' +
      "• Si le serveur ER:LC est vide, l'API refuse les commandes : le ban ou le déban est mis en attente et appliqué dès qu'un joueur se connecte.\n" +
      '• Les commandes sont envoyées au maximum une toutes les 5 secondes environ, les suivantes patientent.\n' +
      '• Les kick et ban en jeu sont limités par membre du staff (sécurité), et tout est enregistré dans les salons de logs.',
  });
  return embed;
}

/* ---------- Message 3 : grades et règles ---------- */
function embedGrades() {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏅 Grades, règles et automatismes')
    .setDescription('Chaque grade a **tout ce qui précède** (un Administrateur a aussi les commandes du Guide et du Modérateur). Ci-dessous : ce que chaque grade **ajoute**.');

  for (let n = 1; n <= 5; n++) {
    const items = CAPACITES.filter(([action]) => niveauAction(action) === n).map(([, libelle]) => libelle);
    const max = Math.min(config.MUTE_MAX_PAR_NIVEAU[n] ?? 0, config.MUTE_MAX_MS);
    const mute = max ? `\n⏱️ Mute : ${formatDuree(max)} maximum${n >= 4 ? ' (limite de Discord : 28 jours)' : ''}` : '';
    embed.addFields({
      name: n === 1 ? `🔹 ${GRADES[n]}` : `🔹 ${GRADES[n]} (en plus)`,
      value: ((items.length ? items.join(' • ') : '—') + mute).slice(0, 1024),
    });
  }

  embed.addFields(
    {
      name: '👁️ Visibilité des réponses',
      value:
        'Les réponses des commandes sont **visibles par tout le salon**. Elles restent **privées** pour `/commandes`, `/clear`, `/config voir`, `/mots liste`, `/ig diagnostic`, ainsi que pour les refus et les erreurs. ' +
        'Toutes les commandes (réussies ou non) sont enregistrées dans le salon des commandes.',
    },
    {
      name: '🌐 Réseau de serveurs',
      value:
        '• Les mutes et les bans sont répercutés sur **tous** les serveurs du bot.\n' +
        '• Quelqu\'un qui rejoint un autre serveur sans être sur le **serveur principal** est expulsé et reçoit un MP lui demandant de rejoindre d\'abord le principal.\n' +
        '• Quand le bot rejoint un nouveau serveur, tous les bans du réseau y sont appliqués ; ses bans existants sont importés si le bot a été ajouté par un Exécutif ou un Fondateur.',
    },
    {
      name: '🛡️ Protections automatiques',
      value:
        'Anti-raid, anti-spam, filtre de mots (insultes : avertissement, propos graves : mute), anti-nuke, bots ajoutés sans autorisation expulsés, limite de sanctions par membre du staff, ' +
        'paliers d\'avertissements (3 = mute d\'1 h, 5 = expulsion) et fin automatique des bans temporaires.',
    },
  );
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commandes')
    .setDescription('Affiche toutes les commandes du bot (modération et en jeu), les grades et les règles')
    .setDMPermission(false)
    .addBooleanOption(o => o.setName('publier').setDescription('Poster la liste dans le salon (Administrateur et +)').setRequired(false)),

  async execute(i) {
    if (niveau(i.member) < NIVEAU_AIDE()) {
      return i.reply({ content: '❌ Cette commande est réservée au staff.', ...EPH });
    }
    const publier = i.options.getBoolean('publier') ?? false;
    if (publier && niveau(i.member) < niveauAction('publierCommandes')) {
      return i.reply({ content: '❌ Seuls les Administrateurs et plus peuvent publier la liste dans le salon.', ...EPH });
    }

    const ids = await idsCommandes(i.client);
    const options = publier ? {} : EPH;
    // Trois messages : Discord limite à 6000 caractères par message
    await i.reply({ embeds: [embedModeration(i.client, ids)], ...options });
    await i.followUp({ embeds: [embedJeu(ids)], ...options });
    await i.followUp({ embeds: [embedGrades()], ...options });
  },
};
