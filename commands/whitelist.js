const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const base = require('../database');
const { EPH, COULEURS, niveau, envoyerLog } = require('../utils');

// Liste blanche de l'anti-nuke : un membre ou un bot de confiance, sur un serveur précis (ou tous).
const niveauRequis = () => config.NIVEAU_MIN.whitelist ?? 5;
const TOUS = '*';

const optMembre = (o) => o.setName('membre').setDescription('Le membre ou le bot concerné').setRequired(true);
const optServeur = (o) => o.setName('serveur').setDescription('Serveur concerné (liste proposée). Vide = ce serveur').setRequired(false).setAutocomplete(true);

const refuse = (i) => i.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ...EPH });

// Retrouve le serveur choisi (ID, nom, ou « tous »)
function trouverServeur(client, texte, courant) {
  if (!texte) return { id: courant.id, nom: courant.name };
  const t = String(texte).trim();
  if (t === TOUS) return { id: TOUS, nom: 'tous les serveurs' };
  const g = client.guilds.cache.get(t) ?? [...client.guilds.cache.values()].find(x => x.name.toLowerCase() === t.toLowerCase());
  return g ? { id: g.id, nom: g.name } : null;
}

const nomServeur = (client, id) => (id === TOUS ? 'Tous les serveurs' : client.guilds.cache.get(id)?.name ?? `Serveur ${id}`);

// Chaque changement est signalé aux responsables (ping) : c'est une règle de sécurité
async function journaliser(i, titre, user, cible) {
  const embed = new EmbedBuilder().setColor(COULEURS.alerte).setTitle(titre)
    .addFields(
      { name: user.bot ? 'Bot' : 'Membre', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Serveur', value: cible.nom, inline: true },
      { name: 'Par', value: `${i.user}`, inline: true },
    ).setTimestamp();
  const principal = i.client.guilds.cache.get(config.ERLC.GUILD_ID);
  if (principal) await envoyerLog(principal, embed, true);
  const guildCible = cible.id !== TOUS ? i.client.guilds.cache.get(cible.id) : null;
  if (guildCible && (!principal || guildCible.id !== principal.id)) await envoyerLog(guildCible, embed);
}

async function preparer(i) {
  if (niveau(i.member) < niveauRequis()) { await refuse(i); return null; }
  const user = i.options.getUser('membre');
  if (user.id === i.client.user.id) { await i.reply({ content: "❌ Je n'ai pas besoin d'être sur liste blanche.", ...EPH }); return null; }
  const cible = trouverServeur(i.client, i.options.getString('serveur'), i.guild);
  if (!cible) { await i.reply({ content: '❌ Serveur introuvable : choisis-le dans la liste proposée.', ...EPH }); return null; }
  return { user, cible };
}

async function ajouter(i) {
  const p = await preparer(i);
  if (!p) return;
  const nouveau = await base.addWhitelist(p.cible.id, p.user.id, i.user.id);
  if (!nouveau) return i.reply({ content: `❌ ${p.user} est déjà sur liste blanche pour ${p.cible.nom}.`, ...EPH });
  await journaliser(i, '🛡️ Liste blanche : ajout', p.user, p.cible);
  return i.reply(
    `✅ ${p.user}${p.user.bot ? ' (bot)' : ''} est maintenant sur **liste blanche** pour **${p.cible.nom}** : ` +
    (p.user.bot
      ? "l'anti-nuke ne le surveille plus et il peut être ajouté sans être expulsé."
      : "l'anti-nuke ne le surveille plus et les bots qu'il ajoute ne sont plus expulsés."),
  );
}

async function retirer(i) {
  const p = await preparer(i);
  if (!p) return;
  const retire = await base.removeWhitelist(p.cible.id, p.user.id);
  if (!retire) return i.reply({ content: `❌ ${p.user} n'est pas sur liste blanche pour ${p.cible.nom}.`, ...EPH });
  await journaliser(i, '🛡️ Liste blanche : retrait', p.user, p.cible);
  return i.reply(`✅ ${p.user} n'est plus sur liste blanche pour **${p.cible.nom}** : l'anti-nuke le surveille de nouveau.`);
}

async function liste(i) {
  if (niveau(i.member) < niveauRequis()) return refuse(i);
  const texte = i.options.getString('serveur');
  const cible = texte ? trouverServeur(i.client, texte, i.guild) : null;
  if (texte && !cible) return i.reply({ content: '❌ Serveur introuvable : choisis-le dans la liste proposée.', ...EPH });

  const lignes = await base.listWhitelist(cible && cible.id !== TOUS ? cible.id : null);
  const lignesFiltrees = cible?.id === TOUS ? lignes.filter(l => l.guild_id === TOUS) : lignes;
  const embed = new EmbedBuilder().setColor(COULEURS.info)
    .setTitle(`🛡️ Liste blanche de l'anti-nuke${cible ? ` : ${cible.nom}` : ''}`);
  if (!lignesFiltrees.length) {
    embed.setDescription('Personne n\'est sur liste blanche.');
    return i.reply({ embeds: [embed], ...EPH });
  }
  const parServeur = new Map();
  for (const l of lignesFiltrees) {
    if (!parServeur.has(l.guild_id)) parServeur.set(l.guild_id, []);
    parServeur.get(l.guild_id).push(`<@${l.user_id}> (\`${l.user_id}\`) — ajouté par <@${l.added_by}> le <t:${Math.floor(l.added_at / 1000)}:d>`);
  }
  let n = 0;
  for (const [guildId, items] of parServeur) {
    if (++n > 24) break;
    embed.addFields({ name: nomServeur(i.client, guildId), value: items.join('\n').slice(0, 1024) });
  }
  return i.reply({ embeds: [embed], ...EPH });
}

// Suggestions : tous les serveurs où le bot est présent
async function autocomplete(i) {
  const focus = i.options.getFocused(true);
  if (focus.name !== 'serveur' || niveau(i.member) < niveauRequis()) return i.respond([]);
  const q = String(focus.value ?? '').toLowerCase();
  const choix = [
    { name: '🌐 Tous les serveurs', value: TOUS },
    ...[...i.client.guilds.cache.values()].map(g => ({ name: g.name.slice(0, 95), value: g.id })),
  ].filter(c => c.name.toLowerCase().includes(q)).slice(0, 25);
  return i.respond(choix);
}

const commands = [
  {
    data: new SlashCommandBuilder().setName('whitelist')
      .setDescription("Met un membre ou un bot sur liste blanche de l'anti-nuke, sur le serveur choisi")
      .setDMPermission(false).addUserOption(optMembre).addStringOption(optServeur),
    execute: ajouter, autocomplete,
  },
  {
    data: new SlashCommandBuilder().setName('unwhitelist')
      .setDescription("Retire un membre ou un bot de la liste blanche de l'anti-nuke, sur le serveur choisi")
      .setDMPermission(false).addUserOption(optMembre).addStringOption(optServeur),
    execute: retirer, autocomplete,
  },
  {
    data: new SlashCommandBuilder().setName('whitelist-liste')
      .setDescription("Affiche la liste blanche de l'anti-nuke (tous les serveurs, ou celui choisi)")
      .setDMPermission(false).addStringOption(optServeur),
    execute: liste, autocomplete,
  },
];

module.exports = { commands };
