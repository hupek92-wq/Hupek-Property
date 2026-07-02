// db.js — 数据库模块：管理联系人、活动、发送记录
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'blast.db'));
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

-- 每个活动可以设置多轮追加消息，对应 Meta 后台已审核通过的模板
CREATE TABLE IF NOT EXISTS followup_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,        -- 第几轮: 0=首发, 1=第一次追加, 2=第二次追加...
  template_name TEXT NOT NULL,        -- 必须是已在 Meta 后台审核通过的模板名称
  template_lang TEXT DEFAULT 'zh_CN', -- 模板语言代码
  variables TEXT DEFAULT '[]',        -- JSON 数组，对应模板里的 {{1}} {{2}}... 例如 ["name"]
  delay_hours INTEGER NOT NULL,       -- 距离上一轮多少小时后发送(若无回复)
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
);

-- 每个联系人在每个活动里的发送进度
CREATE TABLE IF NOT EXISTS blast_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  current_step INTEGER DEFAULT -1,    -- 已发送到第几轮, -1=尚未开始
  last_sent_at TEXT,
  replied INTEGER DEFAULT 0,          -- 0=未回复, 1=已回复
  replied_at TEXT,
  status TEXT DEFAULT 'pending',      -- pending | sent | replied | failed | done
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY(contact_id) REFERENCES contacts(id),
  UNIQUE(campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  contact_id INTEGER,
  step_order INTEGER,
  direction TEXT,                     -- outbound | inbound
  message TEXT,
  wa_message_id TEXT,                 -- Meta 返回的消息ID，用于核对送达状态
  status TEXT,                        -- sent | failed | delivered | read
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
