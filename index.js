// index.js — 主程序入口：Webhook 服务器 + 排程引擎
const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const blaster = require('./blaster');

const app = express();
app.use(express.json());

// ────────────────────────────────────────────────
// 1. Webhook 验证（Meta 设置 Webhook 时会发一次 GET 请求来验证）
// ────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook 验证成功]');
    res.status(200).send(challenge);
  } else {
    console.log('[Webhook 验证失败] token 不匹配');
    res.sendStatus(403);
  }
});

// ────────────────────────────────────────────────
// 2. Webhook 接收（Meta 推送客户回复 / 消息状态更新到这里）
// ────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // 情况A：客户发来一条新消息（这是我们要的"客户已回复"信号）
    if (value?.messages?.length) {
      for (const msg of value.messages) {
        const fromPhone = msg.from; // 客户手机号
        const text = msg.text?.body || `[非文字消息: ${msg.type}]`;
        console.log(`[收到客户消息] ${fromPhone}: ${text}`);
        blaster.markReplied(fromPhone, text);
      }
    }

    // 情况B：消息状态更新（已送达 delivered / 已读 read / 失败 failed）
    if (value?.statuses?.length) {
      for (const st of value.statuses) {
        blaster.updateDeliveryStatus(st.id, st.status);
      }
    }

    res.sendStatus(200); // 务必快速回 200，Meta 若收不到会重试甚至判定异常
  } catch (err) {
    console.error('[Webhook 处理出错]', err.message);
    res.sendStatus(200); // 即使出错也回200，避免Meta不断重试同一条
  }
});

// 健康检查（方便确认服务器是否还活着）
app.get('/health', (req, res) => res.send('ok'));

// ────────────────────────────────────────────────
// 3. 启动服务器 + 排程引擎
// ────────────────────────────────────────────────
app.listen(config.PORT, () => {
  console.log(`\n[系统就绪] Webhook 服务器运行于端口 ${config.PORT}`);

  cron.schedule(config.CRON_SCHEDULE, () => {
    console.log(`[排程检查] ${new Date().toLocaleString()} 正在检查待发送/待追加的客户...`);
    blaster.checkAndSendFollowups().catch((err) => console.error('[排程出错]', err.message));
  });
  console.log(`[排程已启动] 每 "${config.CRON_SCHEDULE}" 检查一次\n`);
});

process.on('SIGINT', () => {
  console.log('\n正在关闭系统...');
  process.exit(0);
});
