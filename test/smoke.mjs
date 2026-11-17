// Smoke test against the local dev server (npm run dev in another shell,
// or this script boots one itself on PORT 8799).
import { spawn } from "node:child_process";

const PORT = 8799;
const base = `http://localhost:${PORT}`;
const child = spawn("node", ["dev-server.js"], {
  env: { ...process.env, PORT: String(PORT), HFA_STORE_FILE: "/tmp/hfa-test-store.json" },
  stdio: "ignore",
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name} ${extra}`);
  if (!cond) failures++;
}
async function j(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

try {
  await wait(900);

  const services = await j("GET", "/api/services");
  check("catalog 200", services.status === 200);
  check("positioning ja", services.data.positioning.ja.includes("唯一のエージェント向けサービス"));
  check("6 services", services.data.services.length === 6);
  check("no lodging service", !services.data.services.some((s) => /hotel|lodging/i.test(s.id)));
  check("not_offered lists captcha", services.data.not_offered.includes("captcha_or_bot_defense_bypass"));

  const q = await j("POST", "/api/quote", {
    service_id: "shopping_proxy",
    area: "Akihabara",
    items: [{ name: "Limited figure", estimated_price_jpy: 12000, quantity: 1 }],
    requester: { agent_name: "smoke-test", contact: "test@example.com" },
  });
  check("quote 201", q.status === 201, `got ${q.status}`);
  const b = q.data.quote.breakdown;
  check("quote fee 2200", b.quote_fee_jpy === 2200);
  check("akihabara handling 16500*1.1 -> 18200", b.handling_fee_jpy === 18200, `got ${b.handling_fee_jpy}`);
  check("total math", b.total_jpy === 12000 + 2200 + 18200 + 1100, `got ${b.total_jpy}`);

  check("quote returns access_token", typeof q.data.access_token === "string" && q.data.access_token.startsWith("hfa_"));
  check("quote has next_action", typeof q.data.next_action === "string" && q.data.next_action.length > 0);

  const noTok = await j("POST", `/api/quotes/${q.data.quote_id}/accept`, {});
  check("accept without token rejected", noTok.data.error === "invalid_access_token", `got ${noTok.data.error}`);

  const accept = await j("POST", `/api/quotes/${q.data.quote_id}/accept`, { access_token: q.data.access_token });
  check("accept -> pending_review", accept.data.status === "pending_review");
  check("accept does not promise", /NOT a confirmation/.test(accept.data.message));
  check("accept next_action present", typeof accept.data.next_action === "string");

  const status = await j("GET", `/api/quotes/${accept.data.task_id}?access_token=${q.data.access_token}`);
  check("task status pending_review", status.data.status === "pending_review");

  const msg = await j("POST", "/api/message", { id: accept.data.task_id, access_token: q.data.access_token, message: "Please prioritise the red variant." });
  check("send_message ok", msg.data.message_sent === true);
  const status2 = await j("GET", `/api/quotes/${accept.data.task_id}?access_token=${q.data.access_token}`);
  check("message stored", status2.data.messages_count === 1 && status2.data.messages[0].from === "agent");

  const ev = await j("GET", `/api/tasks/${accept.data.task_id}/evidence?access_token=${q.data.access_token}`);
  check("evidence endpoint", ev.status === 200 && Array.isArray(ev.data.evidence));

  const tq = await j("POST", "/api/quote", { service_id: "stock_check", area: "Shibuya", test_mode: true });
  check("test_mode quote", tq.status === 201 && tq.data.test_mode === true);
  const tacc = await j("POST", `/api/quotes/${tq.data.quote_id}/accept`, { access_token: tq.data.access_token });
  check("test_mode accept, no checkout", tacc.data.test_mode === true && tacc.data.checkout_url === null);

  const hotel = await j("POST", "/api/quote", {
    service_id: "phone_reservation",
    details: { venue_type: "hotel", name: "Hotel X" },
  });
  check("hotel reservation rejected", hotel.status === 400 && hotel.data.error === "service_not_offered");

  const rest = await j("POST", "/api/quote", {
    service_id: "phone_reservation",
    details: { venue_type: "restaurant", name: "Sushi-ya", party_size: 2 },
    currency: "USD",
  });
  check("restaurant quote ok", rest.status === 201, `got ${rest.status}`);
  check("usd fx fixed", rest.data.quote.fx && rest.data.quote.fx.jpy_per_usd > 0 && rest.data.quote.fx.total_usd > 0);

  // MCP surface
  const init = await j("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  check("mcp initialize", init.data.result?.serverInfo?.name === "japan-hands");
  const tools = await j("POST", "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" });
  check("mcp 7 tools", tools.data.result.tools.length === 7, `got ${tools.data.result.tools.length}`);
  const call = await j("POST", "/mcp", {
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "request_quote", arguments: { service_id: "queueing", hours: 2, area: "Shinjuku" } },
  });
  const callOut = JSON.parse(call.data.result.content[0].text);
  check("mcp queueing 2h handling 19800", callOut.quote.breakdown.handling_fee_jpy === 19800, `got ${callOut.quote?.breakdown?.handling_fee_jpy}`);
  check("mcp quote returns access_token", typeof callOut.access_token === "string");
} finally {
  child.kill();
}
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
