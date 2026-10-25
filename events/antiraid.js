const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const base = require('../database');
const { COULEURS, envoyerLog } = require('../utils');

const arrivees = new Map();  // guildId -> [{ id, t }]
const raidJusqua = new Map(); // guildId -> timestamp de fin d'alerte

async function punir(membre, raison) {
  const cfg = config.ANTIRAID;
  await membre.send(`Tu as été retiré de **${membre.guild.name}** par la protection anti-raid (${raison}).`).catch(() => {});
  try {
    if (cfg.action === 'ban') await membre.ban({ reason: `Anti-raid : ${raison}` });
    else await membre.kick(`Anti-raid : ${raison}`);
  } catch { /* permissions / hiérarchie */ }
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(membre) {
    const cfg = config.ANTIRAID;
    if (!cfg.actif || membre.user.bot) return;
    if ((await base.getSetting(membre.guild.id, 'antiraid')) === 'off') return;

    const gid = membre.guild.id;
    const now = Date.now();

    // Âge minimum du compte
    if (cfg.ageMinJours > 0 && now - membre.user.createdTimestamp < cfg.ageMinJours * 86_400_000) {
      await punir(membre, `compte créé il y a moins de ${cfg.ageMinJours} jour(s)`);
      await envoyerLog(membre.guild, new EmbedBuilder().setColor(COULEURS.warn)
        .setTitle('Anti-raid : compte trop récent')
        .setDescription(`${membre.user} (\`${membre.id}\`) a été retiré.`).setTimestamp());
      return;
    }

    // Détection de raid : trop d'arrivées en peu de temps
    const liste = (arrivees.get(gid) ?? []).filter(a => now - a.t < cfg.fenetreMs);
    liste.push({ id: membre.id, t: now });
    arrivees.set(gid, liste);

    const enAlerte = (raidJusqua.get(gid) ?? 0) > now;

    if (!enAlerte && liste.length >= cfg.joinsMax) {
      raidJusqua.set(gid, now + cfg.dureeAlerteMs);
      arrivees.set(gid, []);
      let retires = 0;
      for (const a of liste) {
        const m = membre.guild.members.cache.get(a.id);
        if (m) { await punir(m, 'raid détecté'); retires++; }
      }
      await envoyerLog(membre.guild, new EmbedBuilder().setColor(COULEURS.alerte)
        .setTitle('🚨 RAID DÉTECTÉ')
        .setDescription(`${liste.length} arrivées en moins de ${Math.round(cfg.fenetreMs / 1000)} s.\n${retires} compte(s) retiré(s). Les nouveaux arrivants seront sanctionnés pendant ${Math.round(cfg.dureeAlerteMs / 60000)} min.\nUtilise \`/lockdown serveur:true\` si besoin.`)
        .setTimestamp());
      return;
    }

    if (enAlerte) await punir(membre, 'raid en cours');
  },
};
