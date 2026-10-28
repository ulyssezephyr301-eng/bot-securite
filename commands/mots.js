const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const base = require('../database');
const { normaliser, charger, invalider } = require('../filtre');
const { EPH, COULEURS, niveau } = require('../utils');

const MAX_MOTS_PERSO = 200;
const spoiler = (m) => `||${m}||`; // masqué par défaut pour ne pas afficher les mots à l'écran

// Découpe une liste de mots en blocs qui tiennent dans un champ d'embed
function blocs(mots) {
  const res = [];
  let cur = '';
  for (const m of [...mots].sort()) {
    const ajout = (cur ? ', ' : '') + spoiler(m);
    if ((cur + ajout).length > 1000) { res.push(cur); cur = spoiler(m); } else cur += ajout;
  }
  if (cur) res.push(cur);
  return res;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mots')
    .setDescription('Gérer la liste des mots interdits')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('ajouter').setDescription('Ajouter un mot ou une expression à la liste')
      .addStringOption(o => o.setName('mot').setDescription('Le mot ou l\'expression').setRequired(true).setMaxLength(60))
      .addStringOption(o => o.setName('gravite').setDescription('Sanction appliquée').setRequired(true)
        .addChoices(
          { name: 'Insulte : message supprimé + avertissement', value: 'interdit' },
          { name: 'Grave : message supprimé + mute', value: 'grave' },
        )))
    .addSubcommand(s => s.setName('retirer').setDescription('Retirer un mot de la liste (mots de base compris)')
      .addStringOption(o => o.setName('mot').setDescription('Le mot ou l\'expression').setRequired(true).setMaxLength(60)))
    .addSubcommand(s => s.setName('liste').setDescription('Voir la liste des mots interdits (masqués)')),

  async execute(i) {
    if (niveau(i.member) < (config.NIVEAU_MIN.mots ?? 3)) {
      return i.reply({ content: "❌ Seuls les Administrateurs et plus peuvent gérer la liste de mots.", ...EPH });
    }
    const sub = i.options.getSubcommand();
    const guildId = i.guild.id;

    if (sub === 'liste') {
      const f = await charger(guildId);
      const embed = new EmbedBuilder().setColor(COULEURS.info).setTitle('🚫 Mots interdits')
        .setDescription('Les mots sont masqués : clique dessus pour les afficher. Les accents, majuscules et lettres répétées sont ignorés.');
      const ajouter = (titre, mots) => {
        const b = blocs(mots);
        if (!b.length) { embed.addFields({ name: titre, value: '*aucun*' }); return; }
        b.forEach((texte, n) => embed.addFields({ name: n === 0 ? titre : '\u200b', value: texte }));
      };
      ajouter(`Insultes — message supprimé + avertissement (${f.interdits.size})`, f.interdits);
      ajouter(`Propos graves — message supprimé + mute (${f.graves.size})`, f.graves);
      if (f.exclus.size) ajouter(`Retirés de la liste de base (${f.exclus.size})`, f.exclus);
      return i.reply({ embeds: [embed], ...EPH });
    }

    const mot = normaliser(i.options.getString('mot'));
    if (mot.length < 3 || mot.length > 40) {
      return i.reply({ content: '❌ Le mot doit faire entre 3 et 40 caractères (lettres, chiffres, espaces).', ...EPH });
    }

    if (sub === 'ajouter') {
      const gravite = i.options.getString('gravite');
      const lignes = await base.getMots(guildId);
      if (lignes.filter(r => r.niveau !== 'autorise').length >= MAX_MOTS_PERSO && !lignes.some(r => r.mot === mot)) {
        return i.reply({ content: `❌ Limite de ${MAX_MOTS_PERSO} mots ajoutés atteinte.`, ...EPH });
      }
      await base.setMot(guildId, mot, gravite);
      invalider(guildId);
      return i.reply({
        content: `✅ ${spoiler(mot)} ajouté (${gravite === 'grave' ? 'grave : suppression + mute' : 'insulte : suppression + avertissement'}).\n*Il est détecté même avec des accents, des majuscules ou des lettres répétées.*`,
      });
    }

    // retirer
    const f = await charger(guildId);
    if (!f.interdits.has(mot) && !f.graves.has(mot)) {
      return i.reply({ content: "❌ Ce mot n'est pas dans la liste.", ...EPH });
    }
    if (f.baseInterdits.has(mot) || f.baseGraves.has(mot)) await base.setMot(guildId, mot, 'autorise'); // mot de base : on l'exclut
    else await base.deleteMot(guildId, mot);                                                             // mot ajouté : on le supprime
    invalider(guildId);
    return i.reply({ content: `✅ ${spoiler(mot)} retiré de la liste.` });
  },
};
