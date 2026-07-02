# WhatsApp 自动 Blasting 系统（WhatsApp Business API 版）

基于 Meta 官方 **WhatsApp Cloud API**，自动发送消息给联系人，对**没有回复**的客户依照设定时间自动追加发送下一轮内容，客户一旦回复自动停止追加。

相比 `whatsapp-web.js` 版本的优势：
- ✅ 官方授权，**没有封号风险**
- ✅ 不需要 Chromium/浏览器/PM2，服务器配置要求极低
- ✅ 可部署在 Railway、Render 等免费/低成本平台

唯一的代价：首次主动联系客户，**必须使用 Meta 审核通过的模板**，不能像方案B那样自由输入文字。

---

## 一、前置准备：先完成 Meta API 申请

如果还没申请，需要先完成：
1. 注册 [Meta Business Suite](https://business.facebook.com)
2. 在 [developers.facebook.com](https://developers.facebook.com) 创建 App，添加 WhatsApp 产品
3. 绑定手机号码，取得 `Phone Number ID` 和 `Access Token`
4. 创建并提交消息模板给 Meta 审核（审核约24小时）

这些都完成后，才能进行下面的部署步骤。

---

## 二、本地安装

```bash
npm install
cp .env.example .env
```
打开 `.env`，填入你从 Meta 后台拿到的真实数值：
```
WA_PHONE_NUMBER_ID=...
WA_ACCESS_TOKEN=...
WEBHOOK_VERIFY_TOKEN=自己随便设一个密码字串，比如 my_secret_123
```

## 三、设置 Blasting 内容

### 1. 添加联系人
```bash
node cli.js add-contact "Ahmad Farid" "60123456789" "VIP"
```

### 2. 创建活动
```bash
node cli.js create-campaign "六月促销活动"
```

### 3. 设置每一轮要用的模板（核心功能）

**前提**：模板名称必须是你在 Meta 后台已经审核通过的模板（不是随便打字）。比如你在 Meta 后台建了一个叫 `promo_june` 的模板，内容是：
```
您好 {{1}}，本月有专属优惠，详情回复了解更多！
```

那么命令是：
```bash
# 第0轮 = 首发，立即发送
node cli.js add-step 1 0 promo_june zh_CN '["name"]' 0

# 第1轮 = 24小时没回复，自动追加这个模板
node cli.js add-step 1 1 followup_1 zh_CN '["name"]' 24

# 第2轮 = 再过72小时还没回复，自动追加最后这个模板
node cli.js add-step 1 2 followup_2 zh_CN '["name"]' 72
```
参数说明：`<campaignId> <轮次> <模板名称> <语言代码> <变量JSON> <延迟小时>`
- 变量 JSON `["name"]` 代表模板里的 `{{1}}` 会自动替换成联系人的 `name` 字段
- 语言代码要跟模板审核时设置的语言一致（如 `zh_CN`、`en_US`）

### 4. 启动活动
```bash
node cli.js launch 1
```

### 5. 启动主程序（Webhook + 排程引擎）
```bash
npm start
```
程序会在你设置的端口（默认3000）启动一个 Webhook 服务器，并开始每15分钟检查一次"谁该收到下一轮"。

---

## 四、设置 Webhook（让系统能"知道"客户有没有回复）

这是**API 版本特有、且必须做**的一步——没有这步，系统无法判断客户是否已回复。

### 4.1 你的服务器需要一个公开的 HTTPS 网址
本地开发阶段可以用 [ngrok](https://ngrok.com) 临时生成一个公开网址：
```bash
ngrok http 3000
```
会得到类似 `https://abcd1234.ngrok.io` 的网址。正式上线后应该用真实部署的网址（见下方部署章节）。

### 4.2 到 Meta 后台设置 Webhook
1. 进入 Meta Developer Portal → 你的 App → WhatsApp → Configuration
2. Webhook URL 填：`https://你的网址/webhook`
3. Verify Token 填你在 `.env` 里设置的 `WEBHOOK_VERIFY_TOKEN`
4. 点击「Verify and Save」（此时你的服务器必须正在运行，否则验证会失败）
5. 订阅 `messages` 字段（这样客户回复消息时 Meta 才会推送给你）

设置成功后，客户在 WhatsApp 上的任何回复都会被推送到你的 `/webhook`，系统自动标记该客户「已回复」，停止后续追加。

---

## 五、系统判断逻辑（与之前版本相同）

```
首发 (第0轮) 已发送
    ↓
客户回复了吗？（由 Webhook 即时告知）
    ├─ 是 → 标记 replied=1，永久停止该客户后续所有追加
    └─ 否 → 等待你设置的 delay_hours
              ↓
         时间到了，仍未回复 → 自动发送下一轮模板
              ↓
         （重复，直到最后一轮发完）
```

---

## 六、部署到云端（比方案B简单很多）

因为不需要 Chromium，可以用更轻量的平台。两个推荐选项：

### 选项A：Railway（最简单，有免费额度）
1. 注册 [railway.app](https://railway.app)，用 GitHub 账号登录
2. 把这个项目推送到一个 GitHub 仓库
3. Railway 后台 "New Project" → "Deploy from GitHub repo"，选择你的仓库
4. 在 Railway 的 Environment Variables 设置里，把 `.env` 里的内容一项一项填进去
5. 部署完成后，Railway 会给你一个公开网址，例如 `https://your-app.up.railway.app`
6. 用这个网址 + `/webhook` 去 Meta 后台设置 Webhook（见上方第四节）

### 选项B：普通 VPS（Vultr/DigitalOcean，1GB 内存即可，不需要 Chromium）
```bash
ssh root@你的服务器IP
apt update && apt install -y nodejs npm
npm install -g pm2

# 上传项目（在自己电脑执行）
scp wa-api-blast.zip root@你的服务器IP:/root/

# 在服务器解压安装
cd /root && unzip wa-api-blast.zip && cd wa-api-blast
npm install
cp .env.example .env
nano .env   # 填入真实凭证

pm2 start index.js --name wa-api-blast
pm2 startup && pm2 save
```
然后需要给这台 VPS 配置一个域名 + SSL 证书（Meta Webhook **要求 HTTPS**），可以用 Nginx + Let's Encrypt（`certbot`）免费搞定，或者用 Cloudflare Tunnel 更省事。

---

## 七、文件结构

| 文件 | 作用 |
|---|---|
| `index.js` | 主程序：Webhook 服务器 + 排程引擎 |
| `waApi.js` | 封装对 Meta Cloud API 的 HTTP 调用 |
| `blaster.js` | 核心逻辑：判断该发哪一轮、标记已回复 |
| `db.js` | 数据库结构 |
| `cli.js` | 命令行管理工具 |
| `config.js` / `.env` | API 凭证、排程参数设置 |

## 八、注意事项

- 模板消息**必须先在 Meta 后台创建并审核通过**才能使用，审核大约需要24小时
- 客户回复后的 24 小时内，你可以用 `waApi.sendTextMessage()` 自由回复文字（不受模板限制），超过24小时窗口又要用模板
- Webhook 网址必须是 **HTTPS**，本机测试用 ngrok，正式环境用 Railway 或自行配置 SSL
- `.env` 文件含有敏感凭证，不要上传到公开的 GitHub 仓库（记得加进 `.gitignore`）
