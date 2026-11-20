# 部署说明（3-webusb）

本目录是**纯静态站点**：`index.html`（产品页）+ `go-no-go.html`（排障工具）+ `_headers`（缓存/安全响应头）。
无构建步骤、无后端、无依赖安装——托管方只需把文件以 HTTPS 发出去。

---

## 目标托管：Cloudflare Pages（港/海外客户）

### 1. 建项目
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授权 GitHub，选仓库 `Mxy-qm/3-webusb`（**私有仓库也可以**，这是换 CF 的原因之一）
3. 构建配置：
   - Framework preset：**None**
   - Build command：**留空**
   - Build output directory：**留空**（或 `/`）
4. Deploy → 得到 `https://<project>.pages.dev`

### 2. 绑自有域名
- Pages 项目 → **Custom domains** → **Set up a custom domain** → 输入子域名（如 `test.example.com`）
- 若域名**已托管在同一个 Cloudflare 账户**：自动加 CNAME，直接生效
- 若域名在别处：到域名商加 `CNAME  test → <project>.pages.dev`
- HTTPS 由 Cloudflare 自动签发，无需手工配置

### 3. 访问控制（可选，给客户用建议开）
- Pages 项目 → **Settings** → **Access policy**（或 Zero Trust → Access → Applications）
- 新建应用：域名选上面那个子域名，策略 = **Allow** + 邮箱白名单（免费额度 50 人内）
- 效果：不在名单里的人打开链接会被 Cloudflare 挡在登录页，**页面源码不外流**

### 4. 缓存
`_headers` 已设 HTML 为 `no-cache, must-revalidate`：改完推送，客户端刷新即得新版，**不再需要 `?v=` 参数**。

---

## 备选：GitHub Pages（仅内部用）

现状：`https://mxy-qm.github.io/3-webusb/`，仓库需 Public（免费版）。
限制与条款风险见 GitHub Docs · Pages limits；正式对外/商用建议不要用它。

---

## 方案 B：邀请码网关（Cloudflare Worker + KV，推荐给客户用）

> 不在公司核心域名部署时用这套：独立子域名 + 一客户一码，浏览器拿不到码表。

### 目录结构
```
3-webusb/
├─ index.html / go-no-go.html   页面源文件
├─ gate/worker.js               邀请码网关（校验 + 下发 cookie + 透传静态资源）
├─ gate/test-gate.mjs           逻辑自测（node gate/test-gate.mjs）
├─ scripts/build-site.mjs       生成 public/（wrangler 上传目录）
├─ scripts/new-invite.mjs       生成客户邀请码 + KV 写入命令
├─ wrangler.toml                Workers 配置
└─ public/                      构建产物（已 gitignore）
```

### 首次部署（约 15 分钟）
```bash
cd 3-webusb

# 1) 建 KV namespace，记下返回的 id
npx wrangler kv namespace create INVITES

# 2) 把 id 填进 wrangler.toml 的 [[kv_namespaces]]

# 3) 设置签名密钥（≥32 位随机串）
npx wrangler secret put INVITE_SECRET

# 4) 构建静态资源并部署
node scripts/build-site.mjs
npx wrangler deploy

# 5) 绑定自有子域名（Cloudflare 控制台）：
#    Workers & Pages → 该 Worker → Settings → Domains & Routes → Add custom domain
```

### 发邀请码给客户
```bash
node scripts/new-invite.mjs --note "客户A-英国-李工" --days 30 --max-devices 3
# 输出邀请码（形如 3YPE-E5ZT-VW）和写入 KV 的命令，按提示执行即可
# 加 --put 可直接写入
```

### 撤销 / 查看
```bash
npx wrangler kv key delete --binding=INVITES "code:3YPEE5ZTVW" --remote
npx wrangler kv key list --binding=INVITES --remote
npx wrangler kv key get --binding=INVITES "code:3YPEE5ZTVW" --remote   # 看 used[] 里谁用过
```

### 行为说明
- 未带 cookie 访问任意路径 → 返回邀请码输入页（HTTP 401）
- `POST /redeem` 校验：码存在、未过期、使用次数未达 `maxDevices`
- 通过后下发 `HttpOnly; Secure; SameSite=Lax` 的签名 cookie，默认 30 天（受码有效期截断）
- 已授权访问 → 透传 `index.html` / `go-no-go.html`，HTML 带 `Cache-Control: no-cache`
- 同一 IP 10 分钟内最多 10 次尝试（KV 计数，防暴力猜码）
- `/logout` 可清除 cookie

### 安全边界（务必知悉）
- Cookie 由 HMAC-SHA256 签名，**密钥只在 Worker 环境变量里**，浏览器无法伪造
- 但页面本身仍是纯前端：拿到 cookie 的人可以另存 HTML；邀请码机制防的是"链接扩散"，不是"页面代码保密"
- 邀请码可被转发使用 → 用 `maxDevices` 限制设备数，或缩短有效期

---

## 方案 A：公司自有域名 + 任意 Web 服务器（无邀请码）

**只需要两个文件**（都是纯静态，无构建、无后端、无外部依赖）：

| 文件 | 作用 | 必须? |
|---|---|---|
| `index.html` | 产品页（全部 JS 已内联，含 CH340 驱动） | 必须 |
| `go-no-go.html` | 排障工具页（产品页页脚链接指向它） | 建议一起放，否则页脚链接 404 |

### 硬性要求（缺一不可）
1. **必须 HTTPS**。WebUSB 只在安全上下文可用；纯 HTTP（含内网 http://IP）会被页面拒绝，提示"页面必须在 HTTPS 下打开"
2. 以 `text/html; charset=utf-8` 提供（服务器默认即可）
3. **HTML 不要长缓存**，否则用户看到旧版；建议 `Cache-Control: no-cache`
4. 放任意路径都行，如 `https://your-domain.com/signal/` → 该目录下放 `index.html`

### Nginx 参考配置
```nginx
location /signal/ {
    alias /var/www/signal/;
    index index.html;
    add_header Cache-Control "no-cache, must-revalidate" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
}
```

### Apache 参考（.htaccess 放同目录）
```apache
<FilesMatch "\.html$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
Header set X-Content-Type-Options "nosniff"
```

### 不需要的东西
不必配 Node/PHP/数据库，不必装依赖，不必开 CORS（页面不跨域取数），不必上传字体或图片（无外部资源）。

### 部署后请对方确认
打开 `https://<域名>/<路径>/`，看到浅绿界面、右上角 `Connect` 与 `English` 下拉、页脚 `v0.5.1-alpha` 即成功。

---

## 发布流程

```powershell
cd 3-webusb
git add -A
git commit -m "..."
git push            # Cloudflare Pages 自动重新部署（约 30 秒）
```

推送注意：本机 git 使用 Git Credential Manager，在受限沙箱下会因命名管道不可用而认证失败，需要完整权限执行 push。

---

## 自检清单（每次发布后）
1. 手机打开站点，右上角 Connect 能弹设备选择
2. 连接后 5 秒内出读数，十项无 `--`
3. 存一条记录 → 列表单行显示、`×` 有确认
4. 导出 CSV 能用 Excel 打开（含 BOM）
5. 三语切换正常
