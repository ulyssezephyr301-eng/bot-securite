const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { EPH, niveau, formatDuree } = require('../utils');

const GRADES = { 1: 'Guide', 2: 'Modérateur', 3: 'Administrateur', 4: 'Exécutif', 5: 'Fondateur' };
const grade = (action) => {
  const n = config.NIVEAU_MIN[action];
  if (!n) return null;
  return n >= 5 ? GRADES[5] : `${GRADES[n]} et +`;
};

// Catégories : [nom de la commande, action utilisée dans config.NIVEAU_MIN]
const CATEGORIES = [
  { titre: '⚖️ Sanctions', cmds: [['warn', 'warn'], ['mute', 'mute'], ['unmute', 'unmute'], ['expulser', 'kick'], ['ban', 'ban'], ['unban', 'unban']] },
  { titre: '📨 Demandes de sanction', cmds: [['demande-sanction', 'demande']] },
  { titre: '📋 Suivi des joueurs', cmds: [['sanction', 'voirSanctions'], ['note', 'note'], ['info-joueur', 'infoJoueur']] },
  { titre: '🧹 Gestion des salons', cmds: [['clear', 'clear'], ['lockdown', 'lockdown'], ['unlock', 'lockdown'], ['slowmode', 'lockdown']] },
  { titre: '⚙️ Configuration', cmds: [['config', 'config']] },
  { titre: '📖 Aide', cmds: [['commandes', 'aide']] },
];

const NIVEAU_AIDE = () => config.NIVEAU_MIN.aide ?? 1;

// Construit les lignes à partir des vraies commandes enregistrées dans le bot
function lignes(client, nom, action) {
  const cmd = client.commands.get(nom);
  if (!cmd) return [];
  const json = cmd.data.toJSON();
  const g = action === 'aide'
    ? (NIVEAU_AIDE() >= 5 ? GRADES[5] : `${GRADES[NIVEAU_AIDE()]} et +`)
    : grade(action);
  const suffixe = g ? ` — **${g}**` : '';
  const subs = (json.options ?? []).filter(o => o.type === 1);
  if (subs.length) return subs.map(s => `\`/${nom} ${s.name}\` — ${s.description}${suffixe}`);
  return [`\`/${nom}\` — ${json.description}${suffixe}`];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commandes')
    .setDescription('Affiche toutes les commandes du bot et le grade requis')
    .setDMPermission(false)
    .addBooleanOption(o => o.setName('publier').setDescription('Poster la liste dans le salon (Administrateur et +)').setRequired(false)),

  async execute(i) {
    if (niveau(i.member) < NIVEAU_AIDE()) {
      return i.reply({ content: "❌ Cette commande est réservée au staff.", ...EPH });
    }
    const publier = i.options.getBoolean('publier') ?? false;
    if (publier && niveau(i.member) < (config.NIVEAU_MIN.config ?? 3)) {
      return i.reply({ content: "❌ Seuls les Administrateurs et plus peuvent publier la liste dans le salon.", ...EPH });
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🛡️ Commandes du bot')
      .setDescription("Voici toutes les commandes disponibles. Le grade indiqué est le **minimum requis**.");

    const connues = new Set();
    for (const cat of CATEGORIES) {
      const l = cat.cmds.flatMap(([nom, action]) => { connues.add(nom); return lignes(i.client, nom, action); });
      if (l.length) embed.addFields({ name: cat.titre, value: l.join('\n').slice(0, 1024) });
    }

    // Commandes ajoutées plus tard et pas encore classées
    const autres = [...i.client.commands.keys()].filter(n => !connues.has(n))
      .flatMap(n => lignes(i.client, n, null));
    if (autres.length) embed.addFields({ name: '➕ Autres', value: autres.join('\n').slice(0, 1024) });

    const mutes = [1, 2, 3, 4, 5].map(n => {
      const max = Math.min(config.MUTE_MAX_PAR_NIVEAU[n] ?? 0, config.MUTE_MAX_MS);
      return `${GRADES[n]} : ${max ? formatDuree(max) : 'aucun mute'}`;
    }).join(' • ');
    embed.addFields(
      { name: '⏱️ Durée maximale des mutes', value: mutes + '\n*(Discord limite les mutes à 28 jours.)*' },
      {
        name: '🌐 À savoir',
        value:
          '• Les mutes et les bans sont répercutés sur tous les serveurs du réseau.\n' +
          "• 3 avertissements = mute automatique d'1 h, 5 avertissements = expulsion.\n" +
          "• L'anti-raid, l'anti-spam et l'anti-nuke surveillent le serveur en permanence.\n" +
          "• Chaque sanction est enregistrée dans l'historique du joueur et dans les logs.",
      },
    );

    return i.reply(publier ? { embeds: [embed] } : { embeds: [embed], ...EPH });
  },
};
