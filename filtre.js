const config = require('./config');
const base = require('./database');

/** Met le texte sous une forme comparable : minuscules, sans accents, "l33t" décodé, lettres répétées réduites */
function normaliser(texte) {
  return String(texte)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[$5]/g, 's')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function construire(mots) {
  const liste = [...mots].filter(Boolean).map(echapper);
  return liste.length ? new RegExp(`(^|[^a-z0-9])(?:${liste.join('|')})s?(?=$|[^a-z0-9])`) : null;
}

const cache = new Map(); // guildId -> listes calculées (rafraîchies toutes les minutes)

/** Listes de mots effectives d'un serveur : liste de base (config.js) + ajouts et retraits faits avec /mots */
async function charger(guildId) {
  const c = cache.get(guildId);
  if (c && Date.now() - c.t < 60_000) return c;

  const baseInterdits = new Set(config.MOTS_INTERDITS.map(normaliser).filter(Boolean));
  const baseGraves = new Set(config.MOTS_GRAVES.map(normaliser).filter(Boolean));
  const interdits = new Set(baseInterdits);
  const graves = new Set(baseGraves);
  const exclus = new Set();

  let lignes = [];
  try {
    lignes = await base.getMots(guildId);
  } catch (err) {
    console.error('Impossible de lire les mots filtrés :', err.message);
  }
  for (const r of lignes) {
    if (r.niveau === 'autorise') { interdits.delete(r.mot); graves.delete(r.mot); exclus.add(r.mot); }
    else if (r.niveau === 'grave') { interdits.delete(r.mot); graves.add(r.mot); }
    else if (r.niveau === 'interdit') { graves.delete(r.mot); interdits.add(r.mot); }
  }

  const data = {
    t: Date.now(), interdits, graves, exclus, baseInterdits, baseGraves,
    reInterdits: construire(interdits), reGraves: construire(graves),
  };
  cache.set(guildId, data);
  return data;
}

function invalider(guildId) {
  cache.delete(guildId);
}

module.exports = { normaliser, construire, charger, invalider };
