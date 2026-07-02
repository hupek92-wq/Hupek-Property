// db.js — 数据库模块：管理联系人、活动、发送记录
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'blast.db'));

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,        -- 格式: 60123456789 (含国码，不带+和0)
  tags TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',      -- active | paused | completed
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS followup_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  template_lang TEXT DEFAULT 'zh_CN',
  variables TEXT DEFAULT '[]',
  delay_hours INTEGER NOT NULL,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS blast_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  current_step INTEGER DEFAULT -1,
  last_sent_at TEXT,
  replied INTEGER DEFAULT 0,
  replied_at TEXT,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY(contact_id) REFERENCES contacts(id),
  UNIQUE(campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  contact_id INTEGER,
  step_order INTEGER,
  direction TEXT,
  message TEXT,
  wa_message_id TEXT,
  status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
