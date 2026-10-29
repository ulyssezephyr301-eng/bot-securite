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
Sanctions : /sanction-note /sanction-warn /sanction-mute /sanction-unmute /sanction-expulser /sanction-ban /sanction-unban
Dossier : /sanction voir @membre (sanctions + notes, boutons 🗑️ numérotés + pages), /sanction mute-actif (mutes en cours)
Mots interdits : /mots ajouter|retirer|liste
Aide : /commandes
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

## Salons à configurer sur chaque serveur
- `/config logs` : logs généraux et alertes de sécurité (raid, anti-nuke...)
- `/config sanctions` : toutes les sanctions
- `/config commandes` : toutes les commandes exécutées, réussies ou échouées
- `/config demandes` : demandes de sanction
Garde ces salons privés (réservés au staff).

## Demandes de sanction
Chaque /demande-sanction crée un fil de discussion. Un refus ouvre une fenêtre qui demande une raison
(postée dans le fil, affichée sur la demande et envoyée en MP au demandeur).
Le bot a besoin des permissions « Créer des fils publics » et « Envoyer des messages dans les fils » dans le salon des demandes.

## Commandes en jeu (ER:LC)
- Variable à ajouter sur Render : `ERLC_API_KEY` (la clé API du serveur ER:LC). Ne jamais la mettre dans le code ni sur GitHub.
- `/ig serveur|joueurs|staff|file` (infos), `/ig h|m|pm` (messages), `/ig kick|ban|unban` (sanctions), `/ig commande` (Fondateur).
- Un `/sanction-ban` sur le Discord principal bannit aussi en jeu ; `/sanction-unban` débannit en jeu. Serveur ER:LC vide : mis en attente.
- Le statut du bot alterne entre « N joueurs In Game » et « Surveille N personnes » (réglages dans `config.js` > `ERLC`).

## Dépannage ER:LC
`/ig diagnostic` (Fondateur) teste la clé et le serveur et explique le problème (clé absente, mal formée, expirée, serveur vide...).
L'API utilise `https://api.erlc.gg` (l'ancienne adresse sert de secours). Codes d'erreur ER:LC : 2000 clé absente, 2001 clé mal formée, 2002 clé invalide ou expirée, 3002 serveur vide ou hors ligne.

## Droits et visibilité
- `/config` (toutes les sous-commandes) : Exécutif et Fondateur. `/ig diagnostic` et `/reseau` : Fondateur seulement.
- Les réponses des commandes sont visibles par tout le salon, sauf `/commandes`, `/clear`, `/config voir`, `/mots liste` et `/ig diagnostic` (privées).
- Toutes les commandes (réussies ou non) sont journalisées dans le salon `/config commandes`. `/clear` journalise aussi qui a supprimé combien de messages.

## Commandes ER:LC refusées (code 4000)
Selon la doc officielle d'ER:LC, seules les adresses IP « de confiance » peuvent envoyer des commandes. Le propriétaire du serveur privé ajoute l'adresse du bot
sur https://api.erlc.gg/server-owners : onglet « Settings » du serveur, une adresse IP + un commentaire. `/ig diagnostic` affiche l'adresse du bot.
Render sort d'une plage d'adresses partagée (« any IP within its ranges ») : si l'adresse change, il faut un hébergeur à adresse fixe (machine gratuite Oracle, VPS, ou IP dédiée Render payante).

## Réseau de serveurs
- Serveur principal = `ERLC.GUILD_ID` dans `config.js`. Quelqu'un qui rejoint un autre serveur du bot sans être membre du principal est expulsé et reçoit un MP avec le lien du principal (le bot crée un lien permanent s'il n'y en a pas dans `RESEAU.lienPrincipal`). Les serveurs listés dans `RESEAU.serveursLibres` sont exemptés.
- Quand le bot rejoint un nouveau serveur : tous les bans en cours du réseau y sont appliqués ; ses bans existants sont importés dans le réseau seulement si le bot a été ajouté par un Exécutif ou un Fondateur (ou si le serveur leur appartient).
- `/reseau synchroniser` (Fondateur) refait la synchronisation sur tous les serveurs ; option `importer:True` pour importer les bans existants de chaque serveur.
- Permissions du bot sur chaque serveur : Bannir, Expulser, Voir les logs du serveur ; sur le principal aussi Créer une invitation.
- Conseil : désactiver « Public Bot » dans le portail développeur Discord, pour que personne d'autre ne puisse ajouter le bot.
