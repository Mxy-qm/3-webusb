// 邀请码网关逻辑自测（Node 20+，无需 wrangler）
// 运行：node gate/test-gate.mjs
import assert from "node:assert/strict";
import { signToken, verifyToken, normalizeCode, redeemCode } from "./worker.js";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";

function fakeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key, type) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    _store: store,
  };
}

/* 1. 邀请码规范化 */
assert.equal(normalizeCode(" abcd-efgh-jk "), "ABCDEFGHJK");
assert.equal(normalizeCode("abcd efgh jk"), "ABCDEFGHJK");

/* 2. Cookie 签名与校验 */
const token = await signToken({ c: "ABCDEFGHJK", e: Math.floor(Date.now() / 1000) + 60 }, SECRET);
const ok = await verifyToken(token, SECRET);
assert.equal(ok.c, "ABCDEFGHJK", "签名校验应还原 code");

assert.equal(await verifyToken(token, "wrong-secret"), null, "错误密钥必须拒绝");
assert.equal(await verifyToken(token.slice(0, -2) + "xx", SECRET), null, "被篡改的签名必须拒绝");

const expired = await signToken({ c: "X", e: Math.floor(Date.now() / 1000) - 10 }, SECRET);
assert.equal(await verifyToken(expired, SECRET), null, "过期 token 必须拒绝");

/* 3. 邀请码兑换 */
const fresh = {
  note: "客户A",
  expiresAt: Date.now() + 86400_000,
  maxDevices: 2,
  used: [],
};
const env = { INVITES: fakeKV({ "code:ABCDEFGHJK": JSON.stringify(fresh) }), INVITE_SECRET: SECRET };

let r = await redeemCode(env, "abcd-efgh-jk", { ip: "1.1.1.1", ua: "test" });
assert.equal(r.ok, true, "有效邀请码应通过");
assert.ok(r.exp > Math.floor(Date.now() / 1000), "应返回未来时间");

r = await redeemCode(env, "ZZZZZZZZZZ", {});
assert.equal(r.reason, "invalid", "不存在的码应 invalid");

const expiredRecord = { ...fresh, expiresAt: Date.now() - 1000 };
const env2 = { INVITES: fakeKV({ "code:EXPIREDJJJ": JSON.stringify(expiredRecord) }) };
r = await redeemCode(env2, "EXPIREDJJJ", {});
assert.equal(r.reason, "expired", "过期码应 expired");

const oneSlot = { ...fresh, maxDevices: 1 };
const env3 = { INVITES: fakeKV({ "code:ONESPACE22": JSON.stringify(oneSlot) }) };
r = await redeemCode(env3, "ONESPACE22", { ip: "a" });
assert.equal(r.ok, true, "第一次可用");
r = await redeemCode(env3, "ONESPACE22", { ip: "b" });
assert.equal(r.reason, "exhausted", "超过设备数应 exhausted");

console.log("✓ 邀请码网关逻辑自测通过（规范化 / 签名 / 过期 / 不存在 / 设备上限）");

/* 4. Worker 路由行为（未带 cookie → 网关页；带 cookie → 静态资源；/redeem → 发 cookie） */
const worker = (await import("./worker.js")).default;
const routeEnv = {
  INVITE_SECRET: SECRET,
  INVITES: fakeKV({ "code:ROUTETEST22": JSON.stringify({ note: "路由测试", expiresAt: Date.now() + 86400_000, maxDevices: 3, used: [] }) }),
  ASSETS: { async fetch() { return new Response("<html>app</html>", { headers: { "content-type": "text/html" } }); } },
};

let res = await worker.fetch(new Request("https://example.com/"), routeEnv);
assert.equal(res.status, 401, "无 cookie 应拦截");
assert.match(await res.text(), /邀请码/, "应返回邀请码输入页");

res = await worker.fetch(new Request("https://example.com/redeem", {
  method: "POST",
  headers: { "content-type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
  body: JSON.stringify({ code: "ROUTE-TEST-22" }),
}), routeEnv);
assert.equal(res.status, 200, "有效邀请码兑换应 200");
assert.equal((await res.json()).ok, true);
const setCookie = res.headers.get("Set-Cookie");
assert.match(setCookie, /st_invite=/, "应下发 cookie");
assert.match(setCookie, /HttpOnly/, "cookie 应 HttpOnly");

const cookieValue = setCookie.split(";")[0];
res = await worker.fetch(new Request("https://example.com/", { headers: { Cookie: cookieValue } }), routeEnv);
assert.equal(res.status, 200, "带合法 cookie 应放行");
assert.match(await res.text(), /app/, "应返回静态资源内容");

res = await worker.fetch(new Request("https://example.com/redeem", {
  method: "POST",
  headers: { "content-type": "application/json", "CF-Connecting-IP": "9.9.9.8" },
  body: JSON.stringify({ code: "NOPE" }),
}), routeEnv);
assert.equal(res.status, 403, "无效码应 403");

console.log("✓ Worker 路由测试通过（未授权拦截 / 兑换下发 cookie / cookie 放行 / 无效码拒绝）");