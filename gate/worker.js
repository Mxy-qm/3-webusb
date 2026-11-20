/**
 * 邀请码网关 Worker（Cloudflare Workers + KV）
 *
 * 职责：
 *  1. 未通过邀请码验证的请求 → 返回邀请码输入页
 *  2. POST /redeem 校验邀请码 → 通过后下发签名 Cookie
 *  3. 通过验证后 → 透传静态资源（index.html / go-no-go.html）
 *
 * 环境变量（wrangler secret put）：
 *  - INVITE_SECRET  用于签名 Cookie 的密钥（≥32 字符随机串）
 * KV 绑定：
 *  - INVITES        邀请码表，键形如 code:ABCD-EFGH-JK
 */

const COOKIE_NAME = "st_invite";
const COOKIE_TTL_DAYS = 30;
const MAX_ATTEMPTS = 10;          // 同一 IP 10 分钟内最多尝试次数
const ATTEMPT_WINDOW_SEC = 600;

/* ---------------- 工具 ---------------- */

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** 生成 `payload.signature` 形式的签名串 */
export async function signToken(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** 校验并返回 payload，失败返回 null */
export async function verifyToken(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload || typeof payload.e !== "number") return null;
    if (payload.e * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 规范化邀请码：去空格/连字符，转大写 */
export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[\s-]/g, "");
}

function codeKey(normalized) {
  return `code:${normalized}`;
}

function cookieFrom(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

/* ---------------- 限流 ---------------- */

async function attemptAllowed(env, ip) {
  const key = `rl:${ip}`;
  const raw = await env.INVITES.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  if (count >= MAX_ATTEMPTS) return false;
  await env.INVITES.put(key, String(count + 1), { expirationTtl: ATTEMPT_WINDOW_SEC });
  return true;
}

/* ---------------- 邀请码校验 ---------------- */

export async function redeemCode(env, rawCode, meta = {}) {
  const normalized = normalizeCode(rawCode);
  if (!normalized) return { ok: false, reason: "empty" };

  const record = await env.INVITES.get(codeKey(normalized), "json");
  if (!record) return { ok: false, reason: "invalid" };

  const now = Date.now();
  if (record.expiresAt && record.expiresAt < now) return { ok: false, reason: "expired" };

  const used = Array.isArray(record.used) ? record.used : [];
  const maxDevices = record.maxDevices || 3;
  if (used.length >= maxDevices) return { ok: false, reason: "exhausted" };

  used.push({ at: new Date(now).toISOString(), ip: meta.ip || "", ua: (meta.ua || "").slice(0, 120) });
  record.used = used;
  await env.INVITES.put(codeKey(normalized), JSON.stringify(record));

  // Cookie 有效期不超过邀请码本身的有效期
  let expMs = now + COOKIE_TTL_DAYS * 86400_000;
  if (record.expiresAt) expMs = Math.min(expMs, record.expiresAt);

  return { ok: true, code: normalized, note: record.note || "", exp: Math.floor(expMs / 1000) };
}

/* ---------------- 邀请码输入页 ---------------- */

function gatePage(message = "") {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问验证 · NB-IoT 信号测试</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f6fcf8; color:#14332a; padding:20px;
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .card { background:#fff; border:1px solid #cfe9db; border-radius:16px; padding:24px; width:100%; max-width:360px; }
  h1 { font-size:1.05rem; margin:0 0 6px; color:#1b5e43; }
  p.hint { font-size:.82rem; color:#5d7d6f; margin:0 0 16px; line-height:1.5; }
  input { width:100%; box-sizing:border-box; font-size:1.05rem; padding:11px 12px; border:1px solid #cfe9db;
          border-radius:10px; letter-spacing:1px; text-transform:uppercase; font-family: ui-monospace, Consolas, monospace; }
  button { width:100%; margin-top:12px; font-size:1rem; padding:11px; border:none; border-radius:10px;
           background:#35a173; color:#fff; cursor:pointer; }
  button:disabled { opacity:.5; }
  .err { margin-top:12px; font-size:.85rem; color:#a83232; background:#fdf3f3; border:1px solid #f0c6c6;
         border-radius:8px; padding:8px 10px; }
  .err[hidden] { display:none; }
</style>
</head>
<body>
  <div class="card">
    <h1>访问验证</h1>
    <p class="hint">请输入我们提供的邀请码。<br>Enter the invite code we provided.</p>
    <input id="code" inputmode="latin" autocomplete="off" placeholder="XXXX-XXXX-XX" aria-label="invite code">
    <button id="go">验证 / Continue</button>
    <div class="err" id="err" hidden></div>
  </div>
<script>
  const btn = document.getElementById("go"), input = document.getElementById("code"), err = document.getElementById("err");
  const MSG = {
    invalid: "邀请码无效 / Invalid code",
    expired: "邀请码已过期 / Code expired",
    exhausted: "该邀请码已达到设备上限 / Device limit reached",
    empty: "请输入邀请码 / Enter a code",
    rate: "尝试过于频繁，请稍后再试 / Too many attempts",
    ${message ? `server: ${JSON.stringify(message)},` : ""}
    net: "网络错误，请重试 / Network error"
  };
  async function submit() {
    const code = input.value.trim();
    if (!code) { show(MSG.empty); return; }
    btn.disabled = true;
    try {
      const r = await fetch("/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) { location.replace("/"); return; }
      show(MSG[data.reason] || MSG.invalid);
    } catch { show(MSG.net); }
    btn.disabled = false;
  }
  function show(t) { err.textContent = t; err.hidden = false; }
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  input.focus();
</script>
</body>
</html>`;
}

/* ---------------- 入口 ---------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

    if (url.pathname === "/redeem" && request.method === "POST") {
      if (!(await attemptAllowed(env, ip))) {
        return json({ ok: false, reason: "rate" }, 429);
      }
      let body = {};
      try { body = await request.json(); } catch { /* ignore */ }
      const result = await redeemCode(env, body.code, { ip, ua: request.headers.get("User-Agent") || "" });
      if (!result.ok) {
        const status = result.reason === "rate" ? 429 : 403;
        return json({ ok: false, reason: result.reason }, status);
      }
      const token = await signToken({ c: result.code, e: result.exp }, env.INVITE_SECRET);
      const maxAge = Math.max(0, result.exp - Math.floor(Date.now() / 1000));
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
      });
    }

    if (url.pathname === "/logout") {
      return new Response("已退出", {
        headers: { "content-type": "text/plain; charset=utf-8", "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
      });
    }

    const token = cookieFrom(request, COOKIE_NAME);
    const payload = token ? await verifyToken(token, env.INVITE_SECRET) : null;
    if (!payload) {
      return new Response(gatePage(), {
        status: 401,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      headers.set("Cache-Control", "no-cache, must-revalidate");
    }
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    return new Response(res.body, { status: res.status, headers });
  },
};
