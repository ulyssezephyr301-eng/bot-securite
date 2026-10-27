const { Events } = require('discord.js');
const config = require('../config');
const { LABELS, parseDuree, estExempte, appliquerSanction } = require('../utils');
const { normaliser, charger } = require('../filtre');

const historique = new Map(); // "guildId:userId" -> [{ t, id, salon, contenu }]
const cooldown = new Map();   // anti-doublon de sanctions automatiques

const inviteRe = /(discord\.gg|discord(app)?\.com\/invite)\/[\w-]+/i;

async function sanctionAuto(message, type, raison, dureeMs = null) {
  const cle = `${message.guild.id}:${message.author.id}`;
  if (Date.now() - (cooldown.get(cle) ?? 0) < 10_000) return;
  cooldown.set(cle, Date.now());

  const res = await appliquerSanction({
    guild: message.guild, cibleId: message.author.id, moderateur: message.client.user,
    type, raison: `[Auto] ${raison}`, dureeMs, auto: true,
  });
  if (res.ok) await prevenir(message, `⚠️ ${message.author}, ${raison.toLowerCase()} — ${LABELS[type]} appliqué.`);
}

async function prevenir(message, texte) {
  const info = await message.channel.send(texte).catch(() => null);
  if (info) setTimeout(() => info.delete().catch(() => {}), 6000);
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    const cfg = config.ANTISPAM;
    if (!cfg.actif || !message.guild || message.author.bot || !message.member) return;
    if (estExempte(message.member)) return;

    const texte = message.content ?? '';

    // Listes de mots (liste de base + ajouts / retraits faits avec /mots)
    const filtre = await charger(message.guild.id);
    const brut = normaliser(texte);

    // Propos graves : message supprimé + mute
    if (filtre.reGraves && filtre.reGraves.test(brut)) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'mute', 'Propos discriminatoires, haineux ou dangereux', parseDuree(config.MOTS_GRAVES_MUTE) ?? 1_800_000);
    }

    // Insultes : message supprimé + avertissement
    if (filtre.reInterdits && filtre.reInterdits.test(brut)) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'warn', 'Les insultes sont interdites');
    }

    // Invitations Discord
    if (cfg.bloquerInvitations && inviteRe.test(texte)) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'warn', 'Les invitations Discord sont interdites');
    }

    // Mentions de masse
    if (message.mentions.users.size >= cfg.mentionsMax) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'warn', 'Trop de mentions dans un message');
    }

    // Messages en MAJUSCULES : simple suppression
    const maj = cfg.majuscules;
    if (maj?.actif && texte.length >= maj.longueurMin) {
      const lettres = texte.replace(/[^\p{L}]/gu, '');
      if (lettres.length >= maj.longueurMin * 0.6) {
        const hautes = lettres.replace(/[^\p{Lu}]/gu, '').length;
        if (hautes / lettres.length >= maj.pourcentage) {
          await message.delete().catch(() => {});
          return prevenir(message, `${message.author}, évite d'écrire en majuscules.`);
        }
      }
    }

    // Spam / flood et messages répétés
    const cle = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const fenetreMax = Math.max(cfg.fenetreMs, cfg.doublonsFenetreMs);
    const liste = (historique.get(cle) ?? []).filter(m => now - m.t < fenetreMax);
    const contenu = normaliser(texte);
    liste.push({ t: now, id: message.id, salon: message.channel.id, contenu });
    historique.set(cle, liste);

    const recents = liste.filter(m => now - m.t < cfg.fenetreMs);
    const doublons = contenu.length >= 4
      ? liste.filter(m => m.contenu === contenu && now - m.t < cfg.doublonsFenetreMs)
      : [];

    const spam = recents.length >= cfg.messagesMax ? recents : (doublons.length >= cfg.doublonsMax ? doublons : null);
    if (spam) {
      historique.set(cle, []);
      const ids = spam.filter(m => m.salon === message.channel.id).map(m => m.id);
      await message.channel.bulkDelete(ids, true).catch(() => {});
      return sanctionAuto(message, 'mute', 'Spam', parseDuree(cfg.muteDuree) ?? 600_000);
    }
  },
};
