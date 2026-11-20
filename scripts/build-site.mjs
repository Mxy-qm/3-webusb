#!/usr/bin/env node
/**
 * 生成 public/ 静态资源目录（供 wrangler 上传）
 * 用法：node scripts/build-site.mjs
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const outDir = join(siteRoot, "public");

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const files = ["index.html", "go-no-go.html"];
for (const f of files) {
  const src = join(siteRoot, f);
  if (!existsSync(src)) {
    console.error(`缺少文件：${src}`);
    process.exit(1);
  }
  cpSync(src, join(outDir, f));
}

// 防止把内部文件当静态资源上传
writeFileSync(
  join(outDir, ".assetsignore"),
  ["_headers", "wrangler.toml", "gate/", "scripts/", "DEPLOY.md", "CHANGELOG.md"].join("\n") + "\n",
  "utf8"
);

for (const f of readdirSync(outDir)) {
  const size = statSync(join(outDir, f)).size;
  console.log(`  ${f}  ${(size / 1024).toFixed(1)} KB`);
}
console.log(`已生成：${outDir}`);
