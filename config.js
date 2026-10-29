// ⚙️ CONFIGURATION
const J = 24 * 60 * 60 * 1000; // un jour en ms

module.exports = {
  // Grades du staff (du plus bas au plus haut). Tu peux ajouter d'autres IDs de rôles
  // dans chaque liste (ex : les rôles équivalents d'un autre serveur où le bot est présent).
  ROLES_NIVEAUX: {
    1: ['1514240838916509696'], // Guide (helper)
    2: ['1514240629889175693'], // Modérateur
    3: ['1563694441212944434'], // Administrateur
    4: ['1514237734472908810'], // Exécutif
    5: ['1513966828555210752'], // Fondateur
  },

  // Utilisateurs avec tous les droits quel que soit leur rôle (+ exemptés de l'anti-nuke).
  // Le propriétaire de chaque serveur a automatiquement le niveau 5.
  SUPER_UTILISATEURS: [],

  // Niveau minimum pour chaque action
  NIVEAU_MIN: {
    warn: 1,
    mute: 2,
    unmute: 2,
    kick: 3,          // /expulser
    ban: 3,
    unban: 3,
    demande: 1,       // /demande-sanction (Guide, Modérateur...)
    valider: 3,       // accepter / refuser les demandes
    voirSanctions: 1, // /sanction voir et /mute-actif
    delsanction: 3,   // poubelle 🗑️ : Administrateur et plus
    note: 1,
    clear: 1,
    infoJoueur: 1,
    lockdown: 1,
    config: 4,        // /config (toutes les sous-commandes) : Exécutif et Fondateur
    publierCommandes: 3, // /commandes publier:True
    mots: 3,          // /mots : ajouter / retirer des mots interdits
    ig: 1,            // /ig serveur, joueurs, staff, file
    igMessage: 1,     // /ig h, m, pm
    igKick: 2,        // /ig kick
    igBan: 3,         // /ig ban
    igUnban: 3,       // /ig unban
    igCommande: 5,    // /ig commande (commande ER:LC libre)
    igDiagnostic: 5,  // /ig diagnostic
    reseau: 5,        // /reseau synchroniser
  },

  // Durée maximale de mute selon le niveau (Discord limite de toute façon les timeouts à 28 jours)
  MUTE_MAX_PAR_NIVEAU: {
    1: 0,
    2: 2 * J,
    3: 20 * J,
    4: 30 * J,
    5: 30 * J,
  },
  MUTE_MAX_MS: 28 * J, // limite technique de Discord

  // Rôles ignorés par l'auto-modération (le staff, niveau 1 et plus, l'est déjà)
  EXEMPT_ROLES: [],

  // Salons par défaut (à définir plutôt avec /config sur chaque serveur)
  LOG_CHANNEL_ID: '',        // logs généraux, alertes de sécurité
  SANCTIONS_CHANNEL_ID: '',  // toutes les sanctions
  COMMANDS_CHANNEL_ID: '',   // toutes les commandes exécutées (réussies ou échouées)
  DEMANDES_CHANNEL_ID: '',   // demandes de sanction

  // Les alertes graves (raid, anti-nuke...) mentionnent les rôles de ce niveau et plus
  ALERTES_PING_NIVEAU: 4,

  // Sanctions automatiques selon le nombre d'avertissements
  PALIERS_WARN: [
    { seuil: 3, action: 'mute', duree: '1h' },
    { seuil: 5, action: 'kick' },
  ],

  SANCTIONS_PAR_PAGE: 5,

  // Protection contre un compte staff piraté ou un abus : trop de mutes / expulsions / bans en peu de temps.
  // Les Fondateurs ne sont pas limités.
  ABUS_STAFF: {
    actif: true,
    max: 8,
    fenetreMs: 10 * 60 * 1000,
  },

  ANTIRAID: {
    actif: true,
    joinsMax: 6,            // nombre d'arrivées...
    fenetreMs: 10_000,      // ...en moins de 10 secondes = raid
    action: 'kick',         // 'kick' ou 'ban'
    dureeAlerteMs: 5 * 60 * 1000, // pendant 5 min, tout nouvel arrivant est sanctionné
    ageMinJours: 0,         // âge minimum du compte Discord (0 = désactivé)
  },

  ANTISPAM: {
    actif: true,
    messagesMax: 6,         // 6 messages...
    fenetreMs: 5_000,       // ...en 5 secondes = spam
    muteDuree: '10m',
    doublonsMax: 4,         // 4 fois le même message...
    doublonsFenetreMs: 30_000, // ...en 30 secondes = spam
    mentionsMax: 5,         // 5 mentions ou plus dans un message
    bloquerInvitations: true,
    majuscules: { actif: true, longueurMin: 25, pourcentage: 0.85 }, // message supprimé, sans sanction
  },

  // Insultes : le message est supprimé + avertissement
  MOTS_INTERDITS: [
    'connard', 'connasse', 'salope', 'salaud', 'pute', 'petasse', 'grognasse',
    'encule', 'enculer', 'enfoire', 'batard', 'fdp', 'ntm', 'trouduc',
    'nique ta mere', 'nique ta race', 'nique tes morts',
    'abruti', 'attarde', 'mongol', 'merdeux',
  ],
  // Propos discriminatoires, haineux ou incitant au suicide : le message est supprimé + mute
  MOTS_GRAVES: [
    'negre', 'negro', 'nigger', 'nigga', 'bamboula', 'bougnoule', 'youpin', 'chinetoque',
    'sale arabe', 'sale noir', 'sale juif', 'sale blanc',
    'pede', 'sale pd', 'tapette', 'fiotte', 'gouine', 'tarlouze',
    'heil hitler', 'sieg heil',
    'kys', 'suicide toi', 'va te suicider', 'va te pendre',
  ],
  MOTS_GRAVES_MUTE: '30m',

  // Liaison avec le serveur ER:LC (clé API dans la variable ERLC_API_KEY sur Render, jamais ici)
  ERLC: {
    GUILD_ID: '1513940188060057720',  // serveur Discord principal (celui lié au serveur ER:LC)
    intervalleCommandesMs: 5200,      // délai minimum entre deux commandes envoyées à l'API
    // Commandes interdites dans /ig commande (octroi de grades en jeu, sanctions, arrêt du serveur)
    commandesBloquees: ['admin', 'unadmin', 'headadmin', 'unheadadmin', 'mod', 'unmod', 'helper', 'unhelper', 'ban', 'unban', 'kick', 'shutdown'],
    statut: {
      intervalleMs: 30_000,           // le statut du bot alterne toutes les 30 secondes
      fondateursARetirer: 2,          // retiré du nombre de personnes surveillées (les 2 fondateurs)
    },
  },

  // Réseau de serveurs : tous les serveurs où le bot est présent, avec un serveur principal (ERLC.GUILD_ID)
  RESEAU: {
    serveursLibres: [],  // IDs de serveurs où l'on peut entrer sans être membre du serveur principal
    lienPrincipal: '',   // lien d'invitation du serveur principal envoyé en MP (vide = le bot en crée un)
    importerBans: true,  // quand le bot rejoint un serveur : importer aussi ses bans (seulement si le bot a été ajouté par un Exécutif ou un Fondateur)
    pauseMs: 400,        // pause entre deux bans, pour respecter les limites de Discord
  },

  ANTINUKE: {
    actif: true,
    max: 3,                 // 3 suppressions (salons, rôles) ou bans...
    fenetreMs: 30_000,      // ...en 30 secondes
    creationsMax: 8,        // 8 créations de salons ou de rôles en 30 secondes (seuil plus haut : installation légitime)
    bloquerAjoutBots: true, // un bot ajouté par quelqu'un qui n'est pas Fondateur est expulsé
    utilisateursExemptes: [], // IDs d'utilisateurs de confiance
  },
};
