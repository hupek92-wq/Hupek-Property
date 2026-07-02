require('dotenv').config();

module.exports = {
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID,
  WA_ACCESS_TOKEN: process.env.WA_ACCESS_TOKEN,
  WA_BUSINESS_ACCOUNT_ID: process.env.WA_BUSINESS_ACCOUNT_ID,
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  PORT: process.env.PORT || 3000,

  // API 版本（Meta 定期更新，过期需要改这里）
  WA_API_VERSION: 'v19.0',

  // 排程检查间隔（多久检查一次是否有人该追加发送）
  CRON_SCHEDULE: '*/15 * * * *',  // 每 15 分钟检查一次

  // 每日发送上限（API 官方也有自己的等级限制，这里是你自己额外设的保险上限）
  DAILY_SEND_LIMIT: 1000,

  // 每条消息之间的发送间隔（API 方式风险低，但仍建议保留小间隔避免触发频率限制）
  SEND_DELAY_MS: 1000,
};
