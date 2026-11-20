#!/usr/bin/env node
/**
 * 生成一条客户专属邀请码，并给出写入 Cloudflare KV 的命令
 *
 * 用法：
 *   node scripts/new-invite.mjs --note "客户A-英国-李工" --days 30 --max-devices 3
 *   node scripts/new-invite.mjs --note "客户B" --days 7 --max-devices 1 --put   # 直接写入 KV
 *
 * 依赖：Node 18+（无需安装依赖；--put 模式需要已登录的 wrangler）
 */
import { randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const note = arg("note", "");
if (!note) {
  console.error('缺少 --note，例如：--note "客户A-英国-李工"');
  process.exit(1);
}
const days = parseInt(arg("days", "30"), 10);
const maxDevices = parseInt(arg("max-devices", "3"), 10);
const put = args.includes("--put");

// 去掉易混字符（0/O、1/I/L），避免客户输错
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
const key = `code:${raw}`;
const now = Date.now();
const expiresAt = now + days * 86400_000;

const value = JSON.stringify({ note, createdAt: now, expiresAt, maxDevices, used: [] });
const kvCmd = `npx wrangler kv key put --binding=INVITES "${key}" '${value}' --remote`;

console.log("");
console.log(`邀请码： ${code}`);
console.log(`备注：   ${note}`);
console.log(`有效期： ${days} 天（到 ${new Date(expiresAt).toLocaleString()}）`);
console.log(`设备数： ${maxDevices}`);
console.log("");
console.log("写入 Cloudflare KV（在 3-webusb 目录执行）：");
console.log(kvCmd);
console.log("");
console.log(`撤销：npx wrangler kv key delete --binding=INVITES "${key}" --remote`);

if (put) {
  console.log("\n正在写入 KV…");
  const r = spawnSync(`npx wrangler kv key put --binding=INVITES "${key}" "${value.replace(/"/g, '\\"')}" --remote`, {
    shell: true,
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
