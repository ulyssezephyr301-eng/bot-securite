const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { EPH, niveau, formatDuree } = require('../utils');

const GRADES = { 1: 'Guide', 2: 'Modérateur', 3: 'Administrateur', 4: 'Exécutif', 5: 'Fondateur' };
const DEFAUTS_IG = { ig: 1, igMessage: 1, igKick: 2, igBan: 3, igUnban: 3, igCommande: 5 };

const nomGrade = (n) => (n ? (n >= 5 ? GRADES[5] : `${GRADES[n]} et +`) : null);
const grade = (action) => nomGrade(config.NIVEAU_MIN[action] ?? DEFAUTS_IG[action]);

const NIVEAU_AIDE = () => config.NIVEAU_MIN.aide ?? 1;

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
  { titre: '⚙️ Configuration', cmds: [['config', 'config'], ['mots', 'mots']] },
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
      kick: ['igKick', "Expulse un joueur du serveur ER:LC (:kick). Il peut revenir tout de suite. Sans effet sur Discord."],
      ban: ['igBan', "Bannit un joueur du serveur ER:LC (:ban) par son pseudo Roblox, en jeu seulement. Pour bannir aussi sur Discord, utilise /sanction-ban."],
      unban: ['igUnban', 'Débannit un joueur du serveur ER:LC (:unban) par son pseudo Roblox ou son ID.'],
    },
  },
  {
    titre: '⚙️ Avancé (Fondateur)',
    cmds: {
      diagnostic: ['igCommande', "Teste la liaison avec ER:LC (clé API, serveur) et explique le problème trouvé, par exemple une clé refusée ou un serveur vide."],
      commande: ['igCommande', "Exécute n'importe quelle commande ER:LC, par exemple :time 12. Les commandes qui donnent des grades en jeu, ban, kick et shutdown sont bloquées."],
    },
  },
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
  const gradeDe = (act) => {
    if (act === 'aide') return nomGrade(NIVEAU_AIDE());
    return act ? grade(act) : null;
  };
  const suffixe = (act) => { const g = gradeDe(act); return g ? ` — **${g}**` : ''; };

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
    .setDescription('Le grade indiqué après chaque commande est le **minimum requis**. Les commandes en jeu (ER:LC) sont dans le message suivant.');

  const connues = new Set(['ig']);
  for (const cat of CATEGORIES) {
    const l = cat.cmds.flatMap(([nom, action, subs]) => { connues.add(nom); return lignes(client, ids, nom, action, subs); });
    if (l.length) embed.addFields({ name: cat.titre, value: l.join('\n').slice(0, 1024) });
  }

  // Commandes ajoutées plus tard et pas encore classées
  const autres = [...client.commands.keys()].filter(n => !connues.has(n)).flatMap(n => lignes(client, ids, n, null));
  if (autres.length) embed.addFields({ name: '➕ Autres', value: autres.join('\n').slice(0, 1024) });

  const mutes = [1, 2, 3, 4, 5].map(n => {
    const max = Math.min(config.MUTE_MAX_PAR_NIVEAU[n] ?? 0, config.MUTE_MAX_MS);
    return `${GRADES[n]} : ${max ? formatDuree(max) : 'aucun mute'}`;
  }).join(' • ');
  embed.addFields(
    { name: '⏱️ Durée maximale des mutes', value: `${mutes}\n*(Discord limite les mutes à 28 jours.)*` },
    {
      name: '🌐 À savoir',
      value:
        '• Les mutes et les bans sont répercutés sur tous les serveurs du réseau.\n' +
        "• 3 avertissements = mute automatique d'1 h, 5 avertissements = expulsion.\n" +
        "• L'anti-raid, l'anti-spam et l'anti-nuke surveillent le serveur en permanence.\n" +
        "• Chaque sanction est enregistrée dans l'historique du joueur et dans les logs.",
    },
  );
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
      "• Les commandes sont envoyées au maximum une toutes les 5 secondes environ, les suivantes patientent.\n" +
      '• Les kick et ban en jeu sont limités par membre du staff (sécurité), et tout est enregistré dans les salons de logs.',
  });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commandes')
    .setDescription('Affiche toutes les commandes du bot (modération et en jeu) avec le grade requis')
    .setDMPermission(false)
    .addBooleanOption(o => o.setName('publier').setDescription('Poster la liste dans le salon (Administrateur et +)').setRequired(false)),

  async execute(i) {
    if (niveau(i.member) < NIVEAU_AIDE()) {
      return i.reply({ content: '❌ Cette commande est réservée au staff.', ...EPH });
    }
    const publier = i.options.getBoolean('publier') ?? false;
    if (publier && niveau(i.member) < (config.NIVEAU_MIN.config ?? 3)) {
      return i.reply({ content: '❌ Seuls les Administrateurs et plus peuvent publier la liste dans le salon.', ...EPH });
    }

    const ids = await idsCommandes(i.client);
    const options = publier ? {} : EPH;
    // Deux messages : Discord limite à 6000 caractères par message
    await i.reply({ embeds: [embedModeration(i.client, ids)], ...options });
    await i.followUp({ embeds: [embedJeu(ids)], ...options });
  },
};
