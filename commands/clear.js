const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EPH, COULEURS, peut, envoyerLog } = require('../utils');

// Accepte un ID ou un lien de message Discord
function extraireId(txt) {
  const m = /(\d{17,20})\s*$/.exec(String(txt).trim());
  return m ? m[1] : null;
}

// Journal : qui a supprimé combien de messages, et où
async function journalClear(i, salon, nombre, detail) {
  await envoyerLog(i.guild, new EmbedBuilder().setColor(COULEURS.warn)
    .setTitle('🧹 Messages supprimés')
    .addFields(
      { name: 'Modérateur', value: `${i.user} (\`${i.user.id}\`)`, inline: true },
      { name: 'Salon', value: `${salon}`, inline: true },
      { name: 'Supprimés', value: String(nombre), inline: true },
      { name: 'Détail', value: String(detail).slice(0, 900) },
    ).setTimestamp());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprimer des messages')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('nombre').setDescription('Supprimer les X derniers messages')
      .addIntegerOption(o => o.setName('nombre').setDescription('Entre 1 et 100').setMinValue(1).setMaxValue(100).setRequired(true)))
    .addSubcommand(s => s.setName('entre').setDescription("Supprimer tout ce qui est entre deux messages (inclus)")
      .addStringOption(o => o.setName('debut').setDescription('ID ou lien du premier message').setRequired(true))
      .addStringOption(o => o.setName('fin').setDescription('ID ou lien du dernier message').setRequired(true))),

  async execute(i) {
    if (!peut(i.member, 'clear')) return i.reply({ content: "❌ Tu n'as pas la permission.", ...EPH });
    const salon = i.channel;
    await i.deferReply(EPH);

    try {
      if (i.options.getSubcommand() === 'nombre') {
        const supprimes = await salon.bulkDelete(i.options.getInteger('nombre'), true);
        await journalClear(i, salon, supprimes.size, `les ${i.options.getInteger('nombre')} derniers messages demandés`);
        return i.editReply(`🧹 ${supprimes.size} message(s) supprimé(s). (Les messages de plus de 14 jours ne peuvent pas être supprimés en masse.)`);
      }

      const idA = extraireId(i.options.getString('debut'));
      const idB = extraireId(i.options.getString('fin'));
      if (!idA || !idB) return i.editReply('❌ ID ou lien de message invalide.');
      const mA = await salon.messages.fetch(idA).catch(() => null);
      const mB = await salon.messages.fetch(idB).catch(() => null);
      if (!mA || !mB) return i.editReply("❌ Message introuvable dans ce salon (utilise la commande dans le salon concerné).");

      const [premier, dernier] = mA.createdTimestamp <= mB.createdTimestamp ? [mA, mB] : [mB, mA];
      const collectes = [premier];
      let curseur = premier.id;
      let fini = false;
      while (!fini && collectes.length < 1000) {
        const lot = await salon.messages.fetch({ after: curseur, limit: 100 });
        if (!lot.size) break;
        const tries = [...lot.values()].sort((x, y) => x.createdTimestamp - y.createdTimestamp);
        for (const m of tries) {
          if (m.createdTimestamp > dernier.createdTimestamp) { fini = true; break; }
          if (m.id !== premier.id) collectes.push(m);
        }
        curseur = tries[tries.length - 1].id;
      }

      let total = 0;
      for (let k = 0; k < collectes.length; k += 100) {
        const supprimes = await salon.bulkDelete(collectes.slice(k, k + 100), true);
        total += supprimes.size;
      }
      await journalClear(i, salon, total, `de ${premier.url} à ${dernier.url} (${collectes.length} message(s) trouvé(s))`);
      return i.editReply(`🧹 ${total} message(s) supprimé(s) sur ${collectes.length} trouvé(s). (Les messages de plus de 14 jours sont ignorés.)`);
    } catch (err) {
      console.error('Erreur /clear :', err);
      return i.editReply('❌ Impossible de supprimer les messages (permission "Gérer les messages" ?).');
    }
  },
};
