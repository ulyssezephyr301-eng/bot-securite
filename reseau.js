// Réseau de serveurs : accès réservé aux membres du serveur principal et bans communs à tous les serveurs
const { AuditLogEvent, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('./config');
const base = require('./database');
const { niveau, COULEURS, envoyerSanctionLog } = require('./utils');

const pause = (ms) => new Promise(r => setTimeout(r, ms));
const principal = (client) => client.guilds.cache.get(config.ERLC.GUILD_ID) ?? null;
const tousLesServeurs = (client) => [...client.guilds.cache.values()];

// true / false ; relance l'erreur pour tout autre problème (pour ne jamais expulser à tort)
async function estDansPrincipal(main, userId) {
  try {
    await main.members.fetch(userId);
    return true;
  } catch (err) {
    if (err.code === 10007) return false; // Unknown Member
    throw err;
  }
}

// Lien d'invitation du serveur principal (config, sinon lien créé et mémorisé par le bot)
async function lienPrincipal(client) {
  if (config.RESEAU.lienPrincipal) return config.RESEAU.lienPrincipal;
  const main = principal(client);
  if (!main) return null;

  const enregistre = await base.getSetting(main.id, 'invite_principal').catch(() => null);
  if (enregistre) {
    const valide = await client.fetchInvite(enregistre.split('/').pop()).then(() => true).catch(() => false);
    if (valide) return enregistre;
  }
  const moi = main.members.me;
  const salon = [main.systemChannel, ...main.channels.cache.values()]
    .find(c => c && c.type === ChannelType.GuildText && c.permissionsFor(moi)?.has(PermissionFlagsBits.CreateInstantInvite));
  if (!salon) return null;
  try {
    const invitation = await salon.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'Lien du serveur principal (MP aux nouveaux arrivants)' });
    await base.setSetting(main.id, 'invite_principal', invitation.url);
    return invitation.url;
  } catch {
    return null;
  }
}

/* ---------- Arrivée sur un serveur du réseau ---------- */
async function controlerArrivee(membre) {
  const client = membre.client;
  const guild = membre.guild;
  if (membre.user.bot || guild.id === config.ERLC.GUILD_ID) return 'ignore';
  if (config.RESEAU.serveursLibres.includes(guild.id) || config.SUPER_UTILISATEURS.includes(membre.id)) return 'ignore';

  const main = principal(client);
  if (!main) return 'ignore'; // serveur principal introuvable : on ne bloque personne

  let dedans;
  try {
    dedans = await estDansPrincipal(main, membre.id);
  } catch (err) {
    console.error('Vérification du serveur principal impossible :', err.message);
    return 'ignore';
  }
  if (dedans) return 'ignore';

  const lien = await lienPrincipal(client);
  const mp = new EmbedBuilder().setColor(COULEURS.kick)
    .setTitle(`Rejoins d'abord ${main.name}`)
    .setDescription(
      `Tu as été retiré de **${guild.name}** : pour y entrer, tu dois **d'abord rejoindre le serveur principal**, **${main.name}**.\n\n` +
      (lien ? `👉 ${lien}\n\n` : '') +
      `Une fois dedans, tu pourras revenir sur ${guild.name}.`,
    );
  await membre.send({ embeds: [mp] }).catch(() => {}); // MP fermés : tant pis, il est quand même expulsé

  try {
    await membre.kick(`Réseau : doit d'abord rejoindre ${main.name}`);
  } catch {
    await envoyerSanctionLog(main, new EmbedBuilder().setColor(COULEURS.warn)
      .setTitle('⚠️ Expulsion impossible')
      .setDescription(`${membre.user} (\`${membre.id}\`) a rejoint **${guild.name}** sans être sur le serveur principal, mais je n'ai pas pu l'expulser (permission « Expulser des membres » ou rôle trop bas).`)
      .setTimestamp());
    return 'echec';
  }

  const log = new EmbedBuilder().setColor(COULEURS.kick)
    .setTitle('Expulsion automatique : serveur principal manquant')
    .addFields(
      { name: 'Joueur', value: `${membre.user} (\`${membre.id}\`)`, inline: true },
      { name: 'Serveur rejoint', value: guild.name, inline: true },
    ).setTimestamp();
  await envoyerSanctionLog(guild, log);
  await envoyerSanctionLog(main, log);
  return 'expulse';
}

/* ---------- Bans communs à tous les serveurs ---------- */
async function bansDuServeur(guild) {
  const res = new Map();
  let apres;
  for (;;) {
    const lot = await guild.bans.fetch({ limit: 1000, after: apres, cache: false });
    if (!lot.size) break;
    for (const [id, ban] of lot) res.set(id, ban.reason ?? null);
    if (lot.size < 1000) break;
    apres = lot.last().user.id;
  }
  return res;
}

// Le bot a-t-il été ajouté (ou le serveur appartient-il) à un Exécutif / Fondateur du serveur principal ?
async function ajouteurDeConfiance(client, guild) {
  const main = principal(client);
  if (!main) return false;
  const estSur = async (userId) => {
    if (!userId) return false;
    if (config.SUPER_UTILISATEURS.includes(userId)) return true;
    const m = await main.members.fetch(userId).catch(() => null);
    return m ? niveau(m) >= 4 : false;
  };
  if (await estSur(guild.ownerId)) return true;
  const journal = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
  const entree = journal?.entries.find(e => e.target?.id === client.user.id);
  return entree?.executor ? estSur(entree.executor.id) : false;
}

/**
 * 1) applique sur `guild` tous les bans du réseau ;
 * 2) si `importer` : ajoute au réseau les bans déjà présents sur `guild` et les répercute sur les autres serveurs.
 */
async function synchroniserServeur(client, guild, { importer = false } = {}) {
  const rapport = { serveur: guild.name, applique: 0, deja: 0, echec: 0, importTente: importer, importe: 0, propage: 0, echecPropage: 0, erreur: null };

  let locaux;
  try {
    locaux = await bansDuServeur(guild);
  } catch {
    rapport.erreur = "Permission « Bannir des membres » manquante : le bot ne peut ni lire ni appliquer les bans.";
    return rapport;
  }

  const reseau = await base.getBansActifs(Date.now());
  for (const r of reseau) {
    if (locaux.has(r.user_id)) { rapport.deja++; continue; }
    try {
      await guild.members.ban(r.user_id, { reason: `[Réseau] ${r.reason}`.slice(0, 500) });
      locaux.set(r.user_id, r.reason);
      rapport.applique++;
    } catch {
      rapport.echec++;
    }
    await pause(config.RESEAU.pauseMs);
  }

  if (importer) {
    const connus = new Set(reseau.map(r => r.user_id));
    const proteges = new Set([...config.SUPER_UTILISATEURS, client.user.id, ...tousLesServeurs(client).map(g => g.ownerId)]);
    for (const [id, raison] of [...locaux].filter(([id]) => !connus.has(id) && !proteges.has(id))) {
      const motif = `[Import] Ban du serveur ${guild.name}${raison ? ` : ${raison}` : ''}`.slice(0, 500);
      await base.addSanction({ guildId: guild.id, userId: id, moderatorId: client.user.id, type: 'ban', reason: motif, durationMs: null, expiresAt: null });
      rapport.importe++;
      for (const autre of tousLesServeurs(client)) {
        if (autre.id === guild.id) continue;
        try { await autre.members.ban(id, { reason: motif }); rapport.propage++; } catch { rapport.echecPropage++; }
        await pause(config.RESEAU.pauseMs);
      }
    }
  }
  return rapport;
}

async function journaliserSync(client, guild, rapport, { auto = true } = {}) {
  const embed = new EmbedBuilder().setColor(rapport.erreur ? COULEURS.alerte : COULEURS.info)
    .setTitle(`🌐 Synchronisation des bans : ${guild.name}`).setTimestamp();
  if (rapport.erreur) {
    embed.setDescription(`❌ ${rapport.erreur}`);
  } else {
    embed.addFields({
      name: 'Bans du réseau appliqués ici',
      value: `${rapport.applique} appliqué(s), ${rapport.deja} déjà présent(s)${rapport.echec ? `, ${rapport.echec} échec(s)` : ''}`,
    });
    if (rapport.importTente) {
      embed.addFields({
        name: 'Bans de ce serveur importés dans le réseau',
        value: `${rapport.importe} importé(s), répercutés ${rapport.propage} fois sur les autres serveurs${rapport.echecPropage ? ` (${rapport.echecPropage} échec(s))` : ''}`,
      });
    } else if (auto) {
      embed.addFields({
        name: 'Import des bans de ce serveur',
        value: "Non fait : le bot n'a pas été ajouté par un Exécutif ou un Fondateur. Un Fondateur peut lancer `/reseau synchroniser importer:True`.",
      });
    }
  }
  const main = principal(client);
  if (main) await envoyerSanctionLog(main, embed);
  if (!main || main.id !== guild.id) await envoyerSanctionLog(guild, embed);
}

/* ---------- Le bot rejoint un nouveau serveur ---------- */
async function nouveauServeur(guild) {
  const client = guild.client;
  if (guild.id === config.ERLC.GUILD_ID) return null;
  if (Date.now() - guild.joinedTimestamp > 120_000) return null; // simple reconnexion, pas une vraie arrivée

  const confiance = await ajouteurDeConfiance(client, guild);
  const rapport = await synchroniserServeur(client, guild, { importer: config.RESEAU.importerBans && confiance });
  await journaliserSync(client, guild, rapport, { auto: true });
  return rapport;
}

module.exports = {
  controlerArrivee, nouveauServeur, synchroniserServeur, journaliserSync,
  lienPrincipal, ajouteurDeConfiance, estDansPrincipal,
};
