const { Events } = require('discord.js');
const config = require('../config');
const { LABELS, parseDuree, estExempte, appliquerSanction } = require('../utils');

const historique = new Map(); // "guildId:userId" -> [{ t, id, salon }]
const cooldown = new Map();   // anti-doublon de sanctions automatiques

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motsRe = config.MOTS_INTERDITS.length
  ? new RegExp(`(^|[^\\p{L}\\p{N}])(${config.MOTS_INTERDITS.map(echapper).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu')
  : null;
const inviteRe = /(discord\.gg|discord(app)?\.com\/invite)\/[\w-]+/i;

async function sanctionAuto(message, type, raison, dureeMs = null) {
  const cle = `${message.guild.id}:${message.author.id}`;
  if (Date.now() - (cooldown.get(cle) ?? 0) < 10_000) return;
  cooldown.set(cle, Date.now());

  const res = await appliquerSanction({
    guild: message.guild, cibleId: message.author.id, moderateur: message.client.user,
    type, raison: `[Auto] ${raison}`, dureeMs, auto: true,
  });
  if (res.ok) {
    const info = await message.channel
      .send(`⚠️ ${message.author}, ${raison.toLowerCase()} — ${LABELS[type]} appliqué.`)
      .catch(() => null);
    if (info) setTimeout(() => info.delete().catch(() => {}), 6000);
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    const cfg = config.ANTISPAM;
    if (!cfg.actif || !message.guild || message.author.bot || !message.member) return;
    if (estExempte(message.member)) return;

    // Invitations Discord
    if (cfg.bloquerInvitations && inviteRe.test(message.content)) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'warn', "Les invitations Discord sont interdites");
    }

    // Mentions de masse
    if (message.mentions.users.size >= cfg.mentionsMax) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'warn', 'Trop de mentions dans un message');
    }

    // Mots interdits
    if (motsRe && motsRe.test(message.content)) {
      await message.delete().catch(() => {});
      return sanctionAuto(message, 'warn', 'Langage interdit');
    }

    // Spam / flood
    const cle = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const liste = (historique.get(cle) ?? []).filter(m => now - m.t < cfg.fenetreMs);
    liste.push({ t: now, id: message.id, salon: message.channel.id });
    historique.set(cle, liste);

    if (liste.length >= cfg.messagesMax) {
      historique.set(cle, []);
      const ids = liste.filter(m => m.salon === message.channel.id).map(m => m.id);
      await message.channel.bulkDelete(ids, true).catch(() => {});
      return sanctionAuto(message, 'mute', 'Spam', parseDuree(cfg.muteDuree) ?? 600_000);
    }
  },
};
