# Bot Sanctions & Sécurité — Bruxelles RP

## Installation
1. `npm install`
2. Copie `.env.example` en `.env` et remplis-le (token Discord, CLIENT_ID, URL + token Turso).
3. Ouvre `config.js` : les grades Bruxelles RP sont déjà remplis. Pour un autre serveur, ajoute les IDs de ses rôles dans `ROLES_NIVEAUX`.
4. `npm start` : le bot enregistre tout seul ses commandes slash auprès de Discord quand elles changent (`npm run deploy` reste possible à la main)
5. Sur Render : Start Command = `npm start` (surtout pas `npm run deploy && npm start`, qui peut rester bloqué si Discord limite les enregistrements)

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

## Vérification des comptes Roblox
- `/verification panneau` (Exécutif et Fondateur) poste un bouton « Se vérifier » : le membre tape son pseudo Roblox, le bot contrôle que le compte existe, puis (`VERIF.preuve: 'code'`) lui donne un code à coller dans la description de son profil Roblox. Une fois le code trouvé, le membre est renommé avec le pseudo du compte (et reçoit le rôle `VERIF.roleVerifie` s'il est défini). Un compte Roblox ne peut être lié qu'à un seul membre.
- `/verification jeu actif:True` active l'expulsion en jeu : un compte non vérifié (ou dont le propriétaire a quitté le serveur principal) reçoit un MP en jeu puis est expulsé après `VERIF.kickJeu.delaiAvantKickSec` secondes. Le propriétaire, les co-propriétaires et le staff en jeu ne sont jamais touchés. Impossible d'activer tant qu'aucun compte n'est vérifié.
- `/verification statut` et `/verification retirer @membre`.
- Le compte vérifié sert aussi pour le ban / unban en jeu et pour `/info-joueur`.
- Les expulsions en jeu utilisent les commandes ER:LC : elles demandent que l'adresse IP du bot soit dans les IP de confiance (voir plus haut).

## MP des sanctions
Un joueur sanctionné reçoit un MP, même s'il n'est pas sur le serveur (mute et ban : « valable sur tous les serveurs du réseau »). `/sanction-*` indique au modérateur si le MP est bien arrivé. Quand le ban d'un nouveau serveur est importé dans le réseau, les joueurs concernés reçoivent aussi un MP (`RESEAU.mpBansImportes`).

## Connexion avec Roblox (OAuth)
Le membre clique sur « Se vérifier » puis « Se connecter avec Roblox » : il arrive sur la page officielle de Roblox, autorise la connexion, et le bot reçoit seulement l'identifiant du compte (jamais le mot de passe). Aucun jeton n'est conservé (ils sont révoqués aussitôt).
Mise en place :
1. Dans le Creator Hub de Roblox, crée une application OAuth 2.0 (le compte qui la crée doit remplir les conditions de Roblox, notamment la vérification d'identité).
2. Autorisations : `openid` et `profile`. URL de redirection : celle affichée par `/verification statut` (`https://ton-service.onrender.com/oauth/roblox/callback`).
3. URL de politique de confidentialité : `https://ton-service.onrender.com/confidentialite` ; URL des conditions : `https://ton-service.onrender.com/conditions` (pages fournies par le bot).
4. Sur Render, ajoute `ROBLOX_CLIENT_ID` et `ROBLOX_CLIENT_SECRET` (Render fournit tout seul `RENDER_EXTERNAL_URL` ; `PUBLIC_URL` sert seulement si tu as un domaine personnalisé).
5. `/verification statut` doit afficher « Connexion Roblox : Configurée », puis `/verification panneau`.
- Tant que l'application n'est pas validée par Roblox, le nombre de personnes pouvant s'y connecter est limité : il faut la soumettre à la validation de Roblox. En attendant (ou si OAuth n'est pas configuré), le bot utilise la méthode du code dans la description (`VERIF.mode: 'code'` pour la forcer).
- Garde le service Render éveillé (UptimeRobot) : le retour de Roblox arrive sur ce service.

## Render : le déploiement reste bloqué (« No open ports detected »)
Cause fréquente : la commande de démarrage `npm run deploy && npm start` attend Discord (limite d'enregistrement des commandes) et n'arrive jamais à `npm start`, donc aucun port n'est ouvert.
Solution : dans Render > Settings > Start Command, mettre `npm start`. Le bot ouvre son port tout de suite et enregistre ses commandes en arrière-plan (nouvel essai toutes les 30 minutes si Discord refuse).

## Rôles de vérification et accès aux autres serveurs
- Chaque nouveau membre du serveur principal reçoit le rôle `VERIF.roleNonVerifie`. Une fois vérifié, il le perd, reçoit `VERIF.roleSansPapier` et son pseudo devient son pseudo Roblox. Un membre déjà vérifié qui revient retrouve directement son statut.
- Chaque vérification est annoncée dans `VERIF.salonVerifications` : membre pingé, ancien pseudo Discord, ID Discord, compte et ID Roblox, avatar Roblox, heure.
- Sur les autres serveurs du réseau, un nouveau venu est expulsé s'il n'est pas sur le serveur principal ou s'il a toujours le rôle « non vérifié ». Un MP lui explique la raison. Les membres arrivés avant la mise en place du système n'ont pas ce rôle : ils ne sont pas bloqués.
- Le rôle du bot doit être au-dessus des deux rôles pour pouvoir les donner et les retirer.
- `/verification retirer @membre` lui redonne le rôle « non vérifié ».

## Liste blanche de l'anti-nuke
- `/whitelist membre:@x serveur:…` et `/unwhitelist` (Fondateur seulement) exemptent un membre ou un bot de l'anti-nuke sur le serveur choisi (liste proposée automatiquement, ou « Tous les serveurs »). `/whitelist-liste` affiche qui est exempté et où.
- Un membre exempté peut supprimer des salons ou des rôles, bannir en masse, ou ajouter des bots sans être sanctionné. Un bot exempté peut être ajouté sans être expulsé et peut agir librement.
- Chaque ajout ou retrait est signalé dans les logs (avec mention des responsables). Si un compte exempté est piraté, il n'y a plus de protection : garde la liste courte et retire les membres qui n'en ont plus besoin.
