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
