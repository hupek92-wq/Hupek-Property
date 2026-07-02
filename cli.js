// cli.js — 命令行管理工具
const db = require('./db');

const [, , command, ...args] = process.argv;

function printUsage() {
  console.log(`
可用指令：

  添加联系人:
    node cli.js add-contact "姓名" "60123456789" ["标签"]

  批量导入联系人 (CSV: name,phone,tags):
    node cli.js import-csv contacts.csv

  创建活动:
    node cli.js create-campaign "活动名称"

  为活动添加一轮消息（模板必须已在 Meta 后台审核通过):
    node cli.js add-step <campaignId> <轮次0,1,2...> <模板名称> <语言代码> <变量JSON> <延迟小时>

    例子（首发，模板叫 promo_june，参数填 name，立即发）:
      node cli.js add-step 1 0 promo_june zh_CN '["name"]' 0

    例子（24小时没回复，追加模板 followup_1）:
      node cli.js add-step 1 1 followup_1 zh_CN '["name"]' 24

  启动活动（把目前所有联系人加入排程）:
    node cli.js launch <campaignId>
    node cli.js launch <campaignId> --tag VIP

  查看活动进度:
    node cli.js status <campaignId>

  列出联系人 / 活动:
    node cli.js list-contacts
    node cli.js list-campaigns

  查看某活动的模板设置:
    node cli.js list-steps <campaignId>
`);
}

switch (command) {
  case 'add-contact': {
    const [name, phone, tags = ''] = args;
    if (!name || !phone) { printUsage(); break; }
    db.prepare(`INSERT INTO contacts (name, phone, tags) VALUES (?, ?, ?)`).run(name, phone, tags);
    console.log(`已添加联系人：${name} (${phone})`);
    break;
  }

  case 'import-csv': {
    const fs = require('fs');
    const [file] = args;
    if (!file || !fs.existsSync(file)) { console.log('文件不存在'); break; }
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    const insert = db.prepare(`INSERT OR IGNORE INTO contacts (name, phone, tags) VALUES (?, ?, ?)`);
    let count = 0;
    for (const line of lines) {
      const [name, phone, tags = ''] = line.split(',').map((s) => s.trim());
      if (!name || !phone) continue;
      insert.run(name, phone, tags);
      count++;
    }
    console.log(`已导入 ${count} 位联系人`);
    break;
  }

  case 'create-campaign': {
    const [name] = args;
    if (!name) { printUsage(); break; }
    const result = db.prepare(`INSERT INTO campaigns (name) VALUES (?)`).run(name);
    console.log(`已创建活动："${name}"，campaign_id = ${result.lastInsertRowid}`);
    break;
  }

  case 'add-step': {
    const [campaignId, stepOrder, templateName, lang, variablesJson, delayHours] = args;
    if (!campaignId || stepOrder === undefined || !templateName) { printUsage(); break; }
    db.prepare(`
      INSERT INTO followup_steps (campaign_id, step_order, template_name, template_lang, variables, delay_hours)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      Number(campaignId),
      Number(stepOrder),
      templateName,
      lang || 'zh_CN',
      variablesJson || '[]',
      Number(delayHours || 0)
    );
    console.log(`已为活动 ${campaignId} 添加第 ${stepOrder} 轮（模板:${templateName}，延迟 ${delayHours || 0} 小时）`);
    break;
  }

  case 'launch': {
    const [campaignId] = args;
    const tagIdx = args.indexOf('--tag');
    let contacts;
    if (tagIdx !== -1 && args[tagIdx + 1]) {
      const tag = args[tagIdx + 1];
      contacts = db.prepare(`SELECT id FROM contacts WHERE tags LIKE ?`).all(`%${tag}%`);
    } else {
      contacts = db.prepare(`SELECT id FROM contacts`).all();
    }
    const contactIds = contacts.map((c) => c.id);
    const blaster = require('./blaster');
    blaster.enqueueContacts(Number(campaignId), contactIds);
    console.log(`提示：主程序 (index.js) 运行中会在下一次排程检查时自动发送首轮消息。`);
    break;
  }

  case 'status': {
    const [campaignId] = args;
    const rows = db.prepare(`
      SELECT c.name, c.phone, bp.current_step, bp.replied, bp.status, bp.last_sent_at
      FROM blast_progress bp JOIN contacts c ON c.id = bp.contact_id
      WHERE bp.campaign_id = ?
    `).all(Number(campaignId));
    console.table(rows);
    break;
  }

  case 'list-contacts': {
    console.table(db.prepare(`SELECT id, name, phone, tags FROM contacts`).all());
    break;
  }

  case 'list-campaigns': {
    console.table(db.prepare(`SELECT * FROM campaigns`).all());
    break;
  }

  case 'list-steps': {
    const [campaignId] = args;
    console.table(
      db.prepare(`SELECT * FROM followup_steps WHERE campaign_id = ? ORDER BY step_order`).all(Number(campaignId))
    );
    break;
  }

  default:
    printUsage();
}
