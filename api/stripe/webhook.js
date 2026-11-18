// Stripe webhook — the payment gate's source of truth.
// Verifies the Stripe-Signature header (HMAC-SHA256 over "<t>.<raw body>")
// against STRIPE_WEBHOOK_SECRET; on checkout.session.completed it marks the
// task paid (via session metadata task_id, falling back to the payments
// index). Fails closed: without the secret, or on a bad signature, nothing
// is recorded. The operator console refuses to confirm an unpaid task.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRecord, putRecord } from "../../lib/store.js";
import { notifyOperator } from "../../lib/notify.js";

// The signature check needs the exact raw body. Without this, Vercel's
// default body parser pre-parses JSON and the raw bytes are lost, which
// would make every genuine Stripe signature fail verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function signatureValid(raw, header, secret) {
  if (!header) return false;
  let t = null;
  let v1 = null;
  for (const part of String(header).split(",")) {
    const [k, v] = part.split("=").map((x) => (x || "").trim());
    if (k === "t" && t === null) t = v;
    if (k === "v1" && v1 === null) v1 = v;
  }
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "webhook_not_configured" }));
  }
  const raw = await readRawBody(req);
  if (!signatureValid(raw, req.headers?.["stripe-signature"], secret)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "invalid_signature" }));
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "invalid_json" }));
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    const session = event.data?.object || {};
    let taskId = session.metadata?.task_id || null;
    if (!taskId && session.id) {
      const idx = await getRecord("payments", session.id);
      taskId = idx?.task_id || null;
    }
    const task = taskId ? await getRecord("tasks", taskId) : null;
    if (task) {
      const now = new Date().toISOString();
      if (event.type === "checkout.session.completed" && task.payment?.status !== "paid") {
        task.payment = {
          ...(task.payment || {}),
          status: "paid",
          paid_at: now,
          amount_total: session.amount_total ?? task.payment?.amount_jpy ?? null,
          via: "stripe_webhook",
        };
        task.history = [...(task.history || []), { at: now, event: "payment_received", by: "stripe_webhook" }];
        await putRecord("tasks", task.id, task);
        await notifyOperator("payment_received", { id: task.id, amount_total: session.amount_total ?? null });
      } else if (event.type === "checkout.session.expired") {
        task.history = [...(task.history || []), { at: now, event: "checkout_expired", by: "stripe_webhook" }];
        await putRecord("tasks", task.id, task);
      }
    }
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({ received: true }));
}
