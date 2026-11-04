// Réseau de serveurs : accès réservé aux membres du serveur principal et bans communs à tous les serveurs
const { AuditLogEvent, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('./config');
const base = require('./database');
const { niveau, COULEURS, envoyerSanctionLog } = require('./utils');

const pause = (ms) => new Promise(r => setTimeout(r, ms));

// MP au joueur dont le ban est étendu à tout le réseau (il n'est pas forcément sur les serveurs concernés)
async function mpBanImporte(client, userId, serveur, raison) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return false;
  const embed = new EmbedBuilder().setColor(COULEURS.ban)
    .setTitle('Bannissement étendu à tout le réseau')
    .setDescription(`Tu as été banni de **${serveur}**${raison ? ` (${String(raison).slice(0, 300)})` : ''}. Ce bannissement est maintenant valable sur **tous les serveurs du réseau**.`);
  return user.send({ embeds: [embed] }).then(() => true).catch(() => false);
}
const principal = (client) => client.guilds.cache.get(config.ERLC.GUILD_ID) ?? null;
const tousLesServeurs = (client) => [...client.guilds.cache.values()];

// Le membre du serveur principal, ou null s'il n'y est pas ; relance l'erreur pour tout autre problème (pour ne jamais expulser à tort)
async function estDansPrincipal(main, userId) {
  try {
    return await main.members.fetch(userId);
  } catch (err) {
    if (err.code === 10007) return null; // Unknown Member
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
// Deux raisons possibles d'expulsion : absent du serveur principal, ou vérification pas terminée
const MOTIFS = {
  absent: {
    titre: (main) => `Rejoins d'abord ${main.name}`,
    raison: "Tu n'es pas présent sur le serveur principal.",
    texte: (guild, main) => `Tu as été retiré de **${guild.name}** : pour y entrer, tu dois **d'abord rejoindre le serveur principal**, **${main.name}**.`,
    suite: (guild, main) => `Une fois dedans, termine ta vérification (bouton **Se vérifier**), puis tu pourras revenir sur ${guild.name}.`,
    kick: (main) => `Réseau : doit d'abord rejoindre ${main.name}`,
    logTitre: 'Expulsion automatique : absent du serveur principal',
  },
  nonVerifie: {
    titre: () => "Termine d'abord ta vérification",
    raison: "Tu n'as pas fini ta vérification Roblox.",
    texte: (guild, main) => `Tu as été retiré de **${guild.name}** : tu es bien sur le serveur principal **${main.name}**, mais tu n'as pas encore **terminé ta vérification Roblox**.`,
    suite: (guild, main) => `Sur ${main.name}, clique sur **Se vérifier** et connecte ton compte Roblox. Ensuite tu pourras revenir sur ${guild.name}.`,
    kick: () => 'Réseau : vérification non terminée',
    logTitre: 'Expulsion automatique : vérification non terminée',
  },
};

async function expulserArrivee(membre, main, cle) {
  const m = MOTIFS[cle];
  const guild = membre.guild;
  const lien = await lienPrincipal(membre.client);

  const mp = new EmbedBuilder().setColor(COULEURS.kick)
    .setTitle(m.titre(main))
    .setDescription(`${m.texte(guild, main)}\n\n${m.suite(guild, main)}${lien ? `\n\n👉 ${lien}` : ''}`)
    .addFields({ name: 'Raison', value: m.raison });
  await membre.send({ embeds: [mp] }).catch(() => {}); // MP fermés : tant pis, il est quand même expulsé

  try {
    await membre.kick(m.kick(main));
  } catch {
    await envoyerSanctionLog(main, new EmbedBuilder().setColor(COULEURS.warn)
      .setTitle('⚠️ Expulsion impossible')
      .setDescription(`${membre.user} (\`${membre.id}\`) a rejoint **${guild.name}** (${m.raison.toLowerCase()}) mais je n'ai pas pu l'expulser (permission « Expulser des membres » ou rôle trop bas).`)
      .setTimestamp());
    return 'echec';
  }

  const log = new EmbedBuilder().setColor(COULEURS.kick)
    .setTitle(m.logTitre)
    .addFields(
      { name: 'Joueur', value: `${membre.user} (\`${membre.id}\`)`, inline: true },
      { name: 'Serveur rejoint', value: guild.name, inline: true },
      { name: 'Raison', value: m.raison },
    ).setTimestamp();
  await envoyerSanctionLog(guild, log);
  await envoyerSanctionLog(main, log);
  return 'expulse';
}

async function controlerArrivee(membre) {
  const client = membre.client;
  const guild = membre.guild;
  if (membre.user.bot || guild.id === config.ERLC.GUILD_ID) return 'ignore';
  if (config.RESEAU.serveursLibres.includes(guild.id) || config.SUPER_UTILISATEURS.includes(membre.id)) return 'ignore';

  const main = principal(client);
  if (!main) return 'ignore'; // serveur principal introuvable : on ne bloque personne

  let dansPrincipal;
  try {
    dansPrincipal = await estDansPrincipal(main, membre.id);
  } catch (err) {
    console.error('Vérification du serveur principal impossible :', err.message);
    return 'ignore';
  }
  if (!dansPrincipal) return expulserArrivee(membre, main, 'absent');

  // Sur le principal, mais toujours avec le rôle « non vérifié » : vérification pas terminée
  const role = config.VERIF.roleNonVerifie;
  if (role && dansPrincipal.roles?.cache?.has(role)) return expulserArrivee(membre, main, 'nonVerifie');
  return 'ignore';
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
  const rapport = { serveur: guild.name, applique: 0, deja: 0, echec: 0, importTente: importer, importe: 0, propage: 0, echecPropage: 0, mpEnvoyes: 0, mpEchecs: 0, erreur: null };

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
      if (config.RESEAU.mpBansImportes) {
        if (await mpBanImporte(client, id, guild.name, raison)) rapport.mpEnvoyes++; else rapport.mpEchecs++;
        await pause(config.RESEAU.pauseMpMs);
      }
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
        value: `${rapport.importe} importé(s), répercutés ${rapport.propage} fois sur les autres serveurs${rapport.echecPropage ? ` (${rapport.echecPropage} échec(s))` : ''}` +
          (config.RESEAU.mpBansImportes ? `\nMP aux joueurs : ${rapport.mpEnvoyes} envoyé(s), ${rapport.mpEchecs} impossible(s)` : ''),
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
