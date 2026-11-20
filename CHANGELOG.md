# 变更记录 · 3-webusb

版本号规则：`主.次.修订-阶段`。产品页（`index.html`）走正式版本号；`go-no-go.html` 是内部排障工具，只记构建日期、不占产品版本。

---

## v0.3.3-alpha · 2026-11-20

**修复读数串台导致大量字段显示 `--`**

现场日志暴露问题：`AT+CSQ` 的响应里混进了上一条 `AT+NUESTATS` 的尾巴，导致解析到残缺数据——RSRP/CSQ/PCI 有值，RSRQ/RSSI/SNR/ECL/EARFCN/Band/Cell ID 全空。

修复：
- 每条命令前**排空输入缓冲**（`drainInput`，丢弃上次会话/上条命令残留行）
- 响应**按命令类型过滤**：CSQ 只认 `+CSQ:`，NUESTATS 只认字段行
- NUESTATS **完整性校验 + 最多 3 次重试**（要求含 Signal power / EARFCN / CURRENT BAND / ECL）
- 轮询由 `setInterval` 改为**串行循环**（刷新跑完再等 5 秒），并加 `refreshing` 互斥，杜绝重叠导致的命令交错

## v0.3.2-alpha · 2026-11-20

- AT 日志加「复制日志 / Copy log」与「清空日志 / Clear log」按钮；复制成功后按钮短暂显示「已复制」，失败时自动全选日志文本提示手动复制

## v0.3.1-alpha · 2026-11-20

- 选中设备后把 `产品名 · VID · PID · 序列号` 写到弹窗状态与 AT 日志，便于区分选择框里同名的重复条目（Android 上偶见同一棒子被枚举两次，显示为 `USB Serial () (0)` / `(1)`）
- 「接口被占用」提示补充处置顺序：关掉厚德 App → 拔插 → 换另一个同名条目

## v0.3.0-alpha · 2026-11-20

**UI 改版 + 默认英语**

- 配色改为浅绿色系（浅绿底 `#f6fcf8`、主色 `#35a173`、卡片白底绿边），等级配色：1–2 绿 / 3–4 琥珀 / 5–6 红
- **连接不再占页面**：改为右上角状态按钮（未连接「Connect」/已连接「Connected」+ 绿点），点击弹出对话框，内含连接/断开/关闭与状态提示；连接成功后弹窗自动关闭
- **语言切换改为下拉框**（右上角 `English` / `中文`，选项顺序英语在前），仍持久化到 localStorage
- **默认语言改为英语**（首次访问即英文；切过语言则记住选择）

## v0.1.0-alpha · 2026-11-20

**首个产品页（alpha）**：`index.html` 替换原跳转页，成为根地址默认页面。

新增：
- 双模式：客户视图（等级 1–6 大字号 + 绿/黄/红 + 一句话建议）/ 高级数据（RSRP/RSRQ/RSSI/SNR/CSQ/ECL/EARFCN/PCI/Band/CellID 十项，5 秒自动刷新）
- 判级严格按《NB-Dongle 使用手册 V1.3》RSRP 等级表：> -65 级 1 … ≤ -105 级 6；CSQ 99 提示无信号
- 点位记录：预设标签（A1 原位 / A2 换朝向 / A3 抬高1m / B1 邻树 / OPEN 开阔参照）+ 自定义，存 localStorage，可单条删除
- CSV 导出（UTF-8 BOM，Excel 直读）
- 两点位对比：自动计算 RSRP 差、CSQ 改善、PCI 是否同小区，并按三条判据给「成立 / 不成立」
- 中英双语切换（右上角，选择本地持久化）
- 连接层：自动识别 CH340（vendor class 0xFF）走 esptool-js 驱动，否则走 CDC-ACM 兜底
- 页脚显示版本号与 Alpha 提示
- 页脚加「诊断工具（排障用）」入口 → `go-no-go.html`

**URL 变更提醒（2026-11-20）**：`index.html` 原为「自动跳转到 go-no-go.html」的占位页，已替换为产品页。旧跳转页被浏览器缓存后会把访问者直接带去 `go-no-go.html`，且刷新无效——遇到时用带参数的地址（`.../3-webusb/?v=2`）或无痕窗口打开。**根地址即产品页**。

已知限制：
- 仅测 NB-IoT 主小区读数；邻区明细需用 `go-no-go.html` 的 `AT+NUESTATS=CELL`
- SINR（SNR）口径未定（App 与 AT 非同源），记录但不作判据
- 记录只存本机浏览器，换设备/清缓存会丢
- 单文件无构建，每次改动整页重下

依据的实测结论见 `1-hardware/nb-iot-field-test-module-selection.md` §3「浏览器直连 go/no-go 通过」条。

---

## 工具构建 · 2026-11-20 · `go-no-go.html`

- 四通道连接（原生 Web Serial / WebUSB·CH340 / WebUSB·CDC-ACM / 不过滤诊断）
- AT×10 自动判定 GO/NO-GO；手动 AT 快捷按钮；ECL 行高亮
- 用途：机型/线材/驱动排障。**2026-11-20 判定 GO**（鸿蒙 4 + 原生 Chrome，CH340 通道 10/10）
