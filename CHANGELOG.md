# 变更记录 · 3-webusb

版本号规则：`主.次.修订-阶段`。产品页（`index.html`）走正式版本号；`go-no-go.html` 是内部排障工具，只记构建日期、不占产品版本。

---

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
