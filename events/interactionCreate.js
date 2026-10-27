const { Events, EmbedBuilder } = require('discord.js');
const { EPH, envoyerLogCommande } = require('../utils');

// Boutons journalisés (la navigation entre pages n'est pas enregistrée)
const NOMS_BOUTONS = {
  sc: 'Suppression de sanction (confirmée)',
  dem_ok: 'Demande de sanction acceptée',
};

// Fenêtres (formulaires) journalisées
const NOMS_MODALS = {
  dem_refus: 'Demande de sanction refusée',
};

function decrire(options = []) {
  return options.map(o => {
    if (o.type === 1 || o.type === 2) return `${o.name}${o.options?.length ? ` ${decrire(o.options)}` : ''}`;
    let v;
    if (o.type === 6) v = `<@${o.value}>`;
    else if (o.type === 7) v = `<#${o.value}>`;
    else if (o.type === 8) v = `<@&${o.value}>`;
    else v = String(o.value);
    return `${o.name}: ${v.slice(0, 150)}`;
  }).join(', ');
}

// Repère les réponses d'échec (❌ / ⚠️) pour savoir si la commande a réussi
function surveiller(interaction) {
  const etat = { ok: true, detail: null };
  for (const nom of ['reply', 'editReply', 'followUp']) {
    if (typeof interaction[nom] !== 'function') continue;
    const original = interaction[nom].bind(interaction);
    interaction[nom] = (opts) => {
      const txt = typeof opts === 'string' ? opts : opts?.content;
      if (etat.ok && typeof txt === 'string' && /^\s*(❌|⚠️)/.test(txt)) {
        etat.ok = false;
        etat.detail = txt;
      }
      return original(opts);
    };
  }
  return etat;
}

async function journaliser(interaction, titre, details, etat) {
  if (!interaction.guild) return;
  const embed = new EmbedBuilder()
    .setColor(etat.ok ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`${etat.ok ? '✅' : '❌'} ${titre}`)
    .addFields(
      { name: 'Utilisateur', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
      { name: 'Salon', value: interaction.channelId ? `<#${interaction.channelId}>` : 'Inconnu', inline: true },
      { name: 'Détails', value: (details || 'aucun').slice(0, 1000) },
      { name: 'Résultat', value: etat.ok ? 'Réussie' : String(etat.detail ?? 'Échec').slice(0, 500) },
    )
    .setTimestamp();
  await envoyerLogCommande(interaction.guild, embed);
}

async function erreur(interaction, err) {
  console.error('Erreur interaction :', err);
  const msg = { content: '❌ Une erreur est survenue.', ...EPH };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
    else await interaction.reply(msg);
  } catch { /* ignoré */ }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const client = interaction.client;

    // Suggestions automatiques (ex : pseudos des joueurs en jeu)
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) {
        try { await cmd.autocomplete(interaction); } catch { await interaction.respond([]).catch(() => {}); }
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      const etat = surveiller(interaction);
      const sub = interaction.options.getSubcommand(false);
      const titre = `/${interaction.commandName}${sub ? ` ${sub}` : ''}`;
      const donnees = sub ? interaction.options.data[0]?.options : interaction.options.data;
      try {
        await cmd.execute(interaction);
      } catch (err) {
        etat.ok = false;
        etat.detail = `Erreur interne : ${err.message}`;
        await erreur(interaction, err);
      }
      await journaliser(interaction, titre, decrire(donnees), etat).catch(console.error);
      return;
    }

    if (interaction.isButton()) {
      const prefixe = interaction.customId.split(':')[0];
      const handler = client.buttons.get(prefixe);
      if (!handler) return;
      const etat = surveiller(interaction);
      try {
        await handler(interaction);
      } catch (err) {
        etat.ok = false;
        etat.detail = `Erreur interne : ${err.message}`;
        await erreur(interaction, err);
      }
      if (NOMS_BOUTONS[prefixe]) {
        await journaliser(interaction, `🔘 ${NOMS_BOUTONS[prefixe]}`, `bouton : ${interaction.customId}`, etat).catch(console.error);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const prefixe = interaction.customId.split(':')[0];
      const handler = client.modals.get(prefixe);
      if (!handler) return;
      const etat = surveiller(interaction);
      let details = `fenêtre : ${interaction.customId}`;
      try {
        const raison = interaction.fields.fields.get('raison')?.value;
        if (raison) details += `\nRaison : ${raison.slice(0, 300)}`;
        await handler(interaction);
      } catch (err) {
        etat.ok = false;
        etat.detail = `Erreur interne : ${err.message}`;
        await erreur(interaction, err);
      }
      if (NOMS_MODALS[prefixe]) {
        await journaliser(interaction, `📝 ${NOMS_MODALS[prefixe]}`, details, etat).catch(console.error);
      }
    }
  },
};
