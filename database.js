require('dotenv').config();
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDatabase() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS sanctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions (guild_id, user_id)`,
    `CREATE TABLE IF NOT EXISTS demandes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      duration_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      message_id TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mots_filtres (
      guild_id TEXT NOT NULL,
      mot TEXT NOT NULL,
      niveau TEXT NOT NULL,
      PRIMARY KEY (guild_id, mot)
    )`,
    `CREATE TABLE IF NOT EXISTS liens_roblox (
      discord_id TEXT PRIMARY KEY,
      roblox_id TEXT NOT NULL,
      roblox_name TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS jeu_attente (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      commande TEXT NOT NULL,
      description TEXT,
      essais INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (guild_id, key)
    )`,
  ], 'write');

  // Si la table sanctions existait déjà sans la colonne "active"
  try { await db.execute('ALTER TABLE sanctions ADD COLUMN active INTEGER NOT NULL DEFAULT 1'); } catch {}

  console.log('✅ Base de données prête');
}

/* ---------- Sanctions ---------- */
async function addSanction({ guildId, userId, moderatorId, type, reason, durationMs = null, expiresAt = null }) {
  const r = await db.execute({
    sql: `INSERT INTO sanctions (guild_id, user_id, moderator_id, type, reason, duration_ms, created_at, expires_at, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [guildId, userId, moderatorId, type, reason, durationMs, Date.now(), expiresAt],
  });
  return Number(r.lastInsertRowid);
}

async function getSanctions(userId, offset, limit) {
  const r = await db.execute({
    sql: `SELECT * FROM sanctions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    args: [userId, limit, offset],
  });
  return r.rows;
}

async function countSanctions(userId, type = null) {
  const r = type
    ? await db.execute({ sql: `SELECT COUNT(*) AS n FROM sanctions WHERE user_id = ? AND type = ?`, args: [userId, type] })
    : await db.execute({ sql: `SELECT COUNT(*) AS n FROM sanctions WHERE user_id = ?`, args: [userId] });
  return Number(r.rows[0].n);
}

async function getSanction(id) {
  const r = await db.execute({ sql: `SELECT * FROM sanctions WHERE id = ?`, args: [id] });
  return r.rows[0] ?? null;
}

async function deleteSanction(id) {
  await db.execute({ sql: `DELETE FROM sanctions WHERE id = ?`, args: [id] });
}

async function desactiverSanctions(userId, type) {
  await db.execute({
    sql: `UPDATE sanctions SET active = 0 WHERE user_id = ? AND type = ? AND active = 1`,
    args: [userId, type],
  });
}

async function desactiverParId(id) {
  await db.execute({ sql: `UPDATE sanctions SET active = 0 WHERE id = ?`, args: [id] });
}

async function getMutesActifs(now) {
  const r = await db.execute({
    sql: `SELECT * FROM sanctions WHERE type = 'mute' AND active = 1 AND (expires_at IS NULL OR expires_at > ?)
          ORDER BY expires_at ASC LIMIT 50`,
    args: [now],
  });
  return r.rows;
}

// Nombre de sanctions lourdes (mute / expulsion / ban) données par un modérateur depuis une date
async function countSanctionsParModerateur(moderatorId, depuis) {
  const r = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM sanctions WHERE moderator_id = ? AND created_at >= ? AND type IN ('mute', 'kick', 'ban')`,
    args: [moderatorId, depuis],
  });
  return Number(r.rows[0].n);
}

// Bans en cours dans le réseau (un par joueur, avec le dernier motif)
async function getBansActifs(now) {
  const r = await db.execute({
    sql: `SELECT user_id, MAX(id) AS id, reason FROM sanctions
          WHERE type = 'ban' AND active = 1 AND (expires_at IS NULL OR expires_at > ?)
          GROUP BY user_id`,
    args: [now],
  });
  return r.rows;
}

async function bansExpires(now) {
  const r = await db.execute({
    sql: `SELECT * FROM sanctions WHERE type = 'ban' AND active = 1 AND expires_at IS NOT NULL AND expires_at <= ?`,
    args: [now],
  });
  return r.rows;
}

/* ---------- Demandes ---------- */
async function addDemande({ guildId, userId, requesterId, type, reason, durationMs = null }) {
  const r = await db.execute({
    sql: `INSERT INTO demandes (guild_id, user_id, requester_id, type, reason, duration_ms, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    args: [guildId, userId, requesterId, type, reason, durationMs, Date.now()],
  });
  return Number(r.lastInsertRowid);
}

async function getDemande(id) {
  const r = await db.execute({ sql: `SELECT * FROM demandes WHERE id = ?`, args: [id] });
  return r.rows[0] ?? null;
}

async function setDemandeMessage(id, messageId) {
  await db.execute({ sql: `UPDATE demandes SET message_id = ? WHERE id = ?`, args: [messageId, id] });
}

// Passe la demande de "pending" à un nouveau statut. Renvoie false si elle a déjà été traitée.
async function claimDemande(id, status) {
  const r = await db.execute({ sql: `UPDATE demandes SET status = ? WHERE id = ? AND status = 'pending'`, args: [status, id] });
  return r.rowsAffected > 0;
}

async function resetDemande(id) {
  await db.execute({ sql: `UPDATE demandes SET status = 'pending' WHERE id = ?`, args: [id] });
}

/* ---------- Notes ---------- */
async function addNote({ guildId, userId, authorId, content }) {
  const r = await db.execute({
    sql: `INSERT INTO notes (guild_id, user_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [guildId, userId, authorId, content, Date.now()],
  });
  return Number(r.lastInsertRowid);
}

async function getNotes(userId, limit = 10) {
  const r = await db.execute({
    sql: `SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  return r.rows;
}

async function countNotes(userId) {
  const r = await db.execute({ sql: `SELECT COUNT(*) AS n FROM notes WHERE user_id = ?`, args: [userId] });
  return Number(r.rows[0].n);
}

/* ---------- Mots filtrés (niveau : 'interdit', 'grave' ou 'autorise' = retiré de la liste de base) ---------- */
async function getMots(guildId) {
  const r = await db.execute({ sql: `SELECT mot, niveau FROM mots_filtres WHERE guild_id = ?`, args: [guildId] });
  return r.rows;
}

async function setMot(guildId, mot, niveau) {
  await db.execute({
    sql: `INSERT INTO mots_filtres (guild_id, mot, niveau) VALUES (?, ?, ?)
          ON CONFLICT(guild_id, mot) DO UPDATE SET niveau = excluded.niveau`,
    args: [guildId, mot, niveau],
  });
}

async function deleteMot(guildId, mot) {
  await db.execute({ sql: `DELETE FROM mots_filtres WHERE guild_id = ? AND mot = ?`, args: [guildId, mot] });
}

/* ---------- Comptes Roblox connus (pour débannir en jeu après un ban Discord) ---------- */
async function setLienRoblox(discordId, robloxId, robloxName) {
  await db.execute({
    sql: `INSERT INTO liens_roblox (discord_id, roblox_id, roblox_name, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(discord_id) DO UPDATE SET roblox_id = excluded.roblox_id, roblox_name = excluded.roblox_name, updated_at = excluded.updated_at`,
    args: [discordId, robloxId, robloxName, Date.now()],
  });
}

async function getLienRoblox(discordId) {
  const r = await db.execute({ sql: `SELECT * FROM liens_roblox WHERE discord_id = ?`, args: [discordId] });
  return r.rows[0] ?? null;
}

/* ---------- Commandes ER:LC en attente (serveur vide) ---------- */
async function addAttenteJeu({ guildId, commande, description }) {
  await db.execute({
    sql: `INSERT INTO jeu_attente (guild_id, commande, description, essais, created_at) VALUES (?, ?, ?, 0, ?)`,
    args: [guildId, commande, description ?? null, Date.now()],
  });
}

async function getAttenteJeu(limit = 5) {
  const r = await db.execute({ sql: `SELECT * FROM jeu_attente ORDER BY id ASC LIMIT ?`, args: [limit] });
  return r.rows;
}

async function deleteAttenteJeu(id) {
  await db.execute({ sql: `DELETE FROM jeu_attente WHERE id = ?`, args: [id] });
}

async function incrAttenteJeu(id) {
  await db.execute({ sql: `UPDATE jeu_attente SET essais = essais + 1 WHERE id = ?`, args: [id] });
}

/* ---------- Réglages ---------- */
async function getSetting(guildId, key) {
  const r = await db.execute({ sql: `SELECT value FROM settings WHERE guild_id = ? AND key = ?`, args: [guildId, key] });
  return r.rows[0]?.value ?? null;
}

async function setSetting(guildId, key, value) {
  await db.execute({
    sql: `INSERT INTO settings (guild_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value`,
    args: [guildId, key, value],
  });
}

module.exports = {
  db, initDatabase,
  addSanction, getSanctions, countSanctions, getSanction, deleteSanction,
  desactiverSanctions, desactiverParId, bansExpires, getBansActifs, getMutesActifs, countSanctionsParModerateur,
  addDemande, getDemande, setDemandeMessage, claimDemande, resetDemande,
  addNote, getNotes, countNotes,
  getMots, setMot, deleteMot,
  setLienRoblox, getLienRoblox, addAttenteJeu, getAttenteJeu, deleteAttenteJeu, incrAttenteJeu,
  getSetting, setSetting,
};
