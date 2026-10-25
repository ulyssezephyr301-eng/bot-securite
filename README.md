# Bot Sanctions & Sécurité — Bruxelles RP

## Installation
1. `npm install`
2. Copie `.env.example` en `.env` et remplis-le (token Discord, CLIENT_ID, URL + token Turso).
3. Ouvre `config.js` : les grades Bruxelles RP sont déjà remplis. Pour un autre serveur, ajoute les IDs de ses rôles dans `ROLES_NIVEAUX`.
4. `npm run deploy` (enregistre les commandes slash, à refaire si tu ajoutes/modifies une commande)
5. `npm start`

## Portail développeur Discord
- Onglet **Bot** : active **Server Members Intent** et **Message Content Intent**.
- Invite le bot avec ces permissions : Gérer les rôles, Gérer les salons, Expulser, Bannir, Modérer des membres,
  Gérer les messages, Voir les logs du serveur, Envoyer des messages, Intégrer des liens, Lire l'historique.
- Dans la liste des rôles du serveur, place le rôle du bot AU-DESSUS des rôles qu'il doit sanctionner.

## Premiers réglages sur le serveur
- `/config logs #salon` — salon des logs
- `/config demandes #salon` — salon où arrivent les demandes de sanction
- `/config voir` — vérifier

## Commandes
Sanctions : /warn /mute /unmute /kick /ban /unban
Historique : /sanction @membre (boutons 🗑️ numérotés + pages)
Demandes : /demande-sanction (boutons Accepter / Refuser)
Staff : /note ajouter|voir, /clear nombre|entre, /info-joueur, /lockdown, /unlock, /slowmode, /config

## Sécurité automatique (réglages dans config.js)
Anti-raid, anti-spam, mentions de masse, invitations, mots interdits, anti-nuke, logs complets,
paliers d'avertissements (3 = mute 1h, 5 = kick par défaut), débannissement automatique des bans temporaires.

## Plusieurs serveurs
- Invite le bot sur chaque serveur ; les commandes sont globales (`npm run deploy` une seule fois).
- Mutes et bans sont répercutés sur tous les serveurs du bot (unmute / unban aussi). Warns et expulsions restent locaux.
- L'historique `/sanction` est commun à tous les serveurs.
- Fais `/config logs` et `/config demandes` sur chaque serveur.
- Discord limite les mutes à 28 jours maximum.

## Grades
Guide(1) < Modérateur(2) < Administrateur(3) < Exécutif(4) < Fondateur(5). Réglages dans `NIVEAU_MIN` et `MUTE_MAX_PAR_NIVEAU`.
