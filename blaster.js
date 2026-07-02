// blaster.js — 核心逻辑：发送模板消息、判断该发哪一轮、自动追加、回复后停止
const db = require('./db');
const config = require('./config');
const waApi = require('./waApi');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 把 variables 配置（如 ["name"]）转换成实际要传给模板的文字数组
function buildParams(variablesJson, contact) {
  let varNames;
  try {
    varNames = JSON.parse(variablesJson || '[]');
  } catch {
    varNames = [];
  }
  return varNames.map((v) => contact[v] ?? '');
}

function getTodaySentCount() {
  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM message_log
    WHERE direction = 'outbound'
      AND date(created_at) = date('now')
      AND status = 'sent'
  `).get();
  return row.cnt;
}

// ────────────────────────────────────────────────
// 发送单条模板消息（含日志记录）
// ────────────────────────────────────────────────
async function sendStepMessage(contact, step, campaignId) {
  const params = buildParams(step.variables, contact);
  const previewText = `[模板:${step.template_name}] 参数:${JSON.stringify(params)}`;

  try {
    const result = await waApi.sendTemplateMessage(
      contact.phone,
      step.template_name,
      step.template_lang,
      params
    );
    const waMessageId = result?.messages?.[0]?.id || null;

    db.prepare(`
      INSERT INTO message_log (campaign_id, contact_id, step_order, direction, message, wa_message_id, status)
      VALUES (?, ?, ?, 'outbound', ?, ?, 'sent')
    `).run(campaignId, contact.id, step.step_order, previewText, waMessageId);

    console.log(`[已发送] -> ${contact.name} (${contact.phone}) 第${step.step_order}轮 模板:${step.template_name}`);
    return true;
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    db.prepare(`
      INSERT INTO message_log (campaign_id, contact_id, step_order, direction, message, status)
      VALUES (?, ?, ?, 'outbound', ?, 'failed')
    `).run(campaignId, contact.id, step.step_order, previewText);

    console.error(`[发送失败] -> ${contact.name} (${contact.phone}):`, errMsg);
    return false;
  }
}

// ────────────────────────────────────────────────
// 把联系人加入活动排程队列
// ────────────────────────────────────────────────
function enqueueContacts(campaignId, contactIds) {
  const insertProgress = db.prepare(`
    INSERT OR IGNORE INTO blast_progress (campaign_id, contact_id, current_step, status)
    VALUES (?, ?, -1, 'pending')
  `);
  for (const cid of contactIds) insertProgress.run(campaignId, cid);
  console.log(`[已加入排程] campaign_id=${campaignId}，共 ${contactIds.length} 位联系人`);
}

// ────────────────────────────────────────────────
// 排程核心引擎：检查所有 active 活动，处理两种情况：
//   1) current_step = -1（尚未发送过）-> 发第 0 轮（首发）
//   2) 已超过该轮设定等待时间、仍未回复 -> 发下一轮（追加）
// ────────────────────────────────────────────────
async function checkAndSendFollowups() {
  const campaigns = db.prepare(`SELECT * FROM campaigns WHERE status = 'active'`).all();

  for (const campaign of campaigns) {
    const steps = db.prepare(`
      SELECT * FROM followup_steps WHERE campaign_id = ? ORDER BY step_order ASC
    `).all(campaign.id);

    for (const step of steps) {
      let due;

      if (step.step_order === 0) {
        due = db.prepare(`
          SELECT bp.*, c.name, c.phone
          FROM blast_progress bp JOIN contacts c ON c.id = bp.contact_id
          WHERE bp.campaign_id = ? AND bp.replied = 0 AND bp.current_step = -1
        `).all(campaign.id);
      } else {
        due = db.prepare(`
          SELECT bp.*, c.name, c.phone
          FROM blast_progress bp JOIN contacts c ON c.id = bp.contact_id
          WHERE bp.campaign_id = ?
            AND bp.replied = 0
            AND bp.current_step = ?
            AND bp.status = 'sent'
            AND datetime(bp.last_sent_at, '+' || ? || ' hours') <= datetime('now')
        `).all(campaign.id, step.step_order - 1, step.delay_hours);
      }

      for (const target of due) {
        if (getTodaySentCount() >= config.DAILY_SEND_LIMIT) {
          console.log('[已达每日发送上限，本次排程暂停]');
          return;
        }

        const ok = await sendStepMessage(target, step, campaign.id);

        db.prepare(`
          UPDATE blast_progress
          SET current_step = ?, last_sent_at = datetime('now'), status = ?
          WHERE id = ?
        `).run(step.step_order, ok ? 'sent' : 'failed', target.id);

        await sleep(config.SEND_DELAY_MS);
      }
    }
  }
}

// ────────────────────────────────────────────────
// 当 Webhook 收到客户回复时调用：标记已回复，停止后续追加
// ────────────────────────────────────────────────
function markReplied(phone, incomingMessage) {
  // Meta 传来的号码可能带或不带前导符号，统一去除非数字字符比对
  const cleanPhone = phone.replace(/\D/g, '');
  const contact = db.prepare(`SELECT * FROM contacts WHERE phone = ?`).get(cleanPhone);
  if (!contact) {
    console.log(`[收到回复，但找不到匹配联系人] phone=${cleanPhone}`);
    return;
  }

  const progresses = db.prepare(`
    SELECT * FROM blast_progress WHERE contact_id = ? AND replied = 0
  `).all(contact.id);

  for (const p of progresses) {
    db.prepare(`
      UPDATE blast_progress SET replied = 1, replied_at = datetime('now'), status = 'replied'
      WHERE id = ?
    `).run(p.id);

    db.prepare(`
      INSERT INTO message_log (campaign_id, contact_id, direction, message, status)
      VALUES (?, ?, 'inbound', ?, 'sent')
    `).run(p.campaign_id, contact.id, incomingMessage);

    console.log(`[客户已回复] ${contact.name} (${contact.phone}) -> 已停止后续追加消息`);
  }
}

// ────────────────────────────────────────────────
// 更新消息送达/已读状态（来自 Webhook 的 status 回调）
// ────────────────────────────────────────────────
function updateDeliveryStatus(waMessageId, status) {
  db.prepare(`
    UPDATE message_log SET status = ? WHERE wa_message_id = ?
  `).run(status, waMessageId);
}

module.exports = {
  enqueueContacts,
  checkAndSendFollowups,
  markReplied,
  updateDeliveryStatus,
};
