const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const db = new Database(path.join(__dirname, '..', 'kaaboo.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER DEFAULT (unixepoch()),
    CHECK(requester_id != addressee_id),
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS game_invites (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rounds_played       INTEGER NOT NULL DEFAULT 0,
    kaaboo_calls        INTEGER NOT NULL DEFAULT 0,
    kaaboo_wins         INTEGER NOT NULL DEFAULT 0,
    kaaboo_losses       INTEGER NOT NULL DEFAULT 0,
    playdowns_attempted INTEGER NOT NULL DEFAULT 0,
    playdowns_succeeded INTEGER NOT NULL DEFAULT 0,
    penalties_received  INTEGER NOT NULL DEFAULT 0,
    powers_used         INTEGER NOT NULL DEFAULT 0,
    powers_skipped      INTEGER NOT NULL DEFAULT 0,
    best_card_score     INTEGER,
    total_card_score    INTEGER NOT NULL DEFAULT 0
  );
`);

module.exports = { db, newId: () => randomUUID() };
