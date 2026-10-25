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
    voirSanctions: 1, // /sanction
    delsanction: 3,   // poubelle 🗑️ : Administrateur et plus
    note: 1,
    clear: 1,
    infoJoueur: 1,
    lockdown: 1,
    config: 3,
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

  // Salons (peuvent aussi être définis par serveur avec /config logs et /config demandes)
  LOG_CHANNEL_ID: '',
  DEMANDES_CHANNEL_ID: '',

  // Sanctions automatiques selon le nombre d'avertissements
  PALIERS_WARN: [
    { seuil: 3, action: 'mute', duree: '1h' },
    { seuil: 5, action: 'kick' },
  ],

  SANCTIONS_PAR_PAGE: 5,

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
    mentionsMax: 5,         // 5 mentions ou plus dans un message
    bloquerInvitations: true,
  },

  MOTS_INTERDITS: [],       // ex : ['mot1', 'mot2']

  ANTINUKE: {
    actif: true,
    max: 3,                 // 3 suppressions (salons, rôles) ou bans...
    fenetreMs: 30_000,      // ...en 30 secondes
    utilisateursExemptes: [], // IDs d'utilisateurs de confiance
  },
};
