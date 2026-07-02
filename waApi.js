// waApi.js — 封装对 Meta WhatsApp Cloud API 的调用
const axios = require('axios');
const config = require('./config');

const BASE_URL = `https://graph.facebook.com/${config.WA_API_VERSION}/${config.WA_PHONE_NUMBER_ID}/messages`;

function headers() {
  return {
    Authorization: `Bearer ${config.WA_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// ────────────────────────────────────────────────
// 发送模板消息（首次主动联系客户必须用已审核的模板）
// templateName: Meta 后台审核通过的模板名称
// lang: 模板语言代码，例如 'zh_CN', 'en_US'
// params: 模板里 {{1}} {{2}}... 对应的实际文字，按顺序传入字符串数组
// ────────────────────────────────────────────────
async function sendTemplateMessage(toPhone, templateName, lang, params = []) {
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: params.length
        ? [
            {
              type: 'body',
              parameters: params.map((p) => ({ type: 'text', text: String(p) })),
            },
          ]
        : [],
    },
  };

  const res = await axios.post(BASE_URL, payload, { headers: headers() });
  return res.data; // { messages: [{ id: 'wamid.xxx' }] }
}

// ────────────────────────────────────────────────
// 发送自由文字消息（仅能在客户最近24小时内主动联系过你时使用，
// 例如客户已回复后，你想自由回话，不受模板限制）
// ────────────────────────────────────────────────
async function sendTextMessage(toPhone, text) {
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'text',
    text: { body: text },
  };
  const res = await axios.post(BASE_URL, payload, { headers: headers() });
  return res.data;
}

module.exports = {
  sendTemplateMessage,
  sendTextMessage,
};
