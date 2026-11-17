// Per-IP fixed-window rate limiting (abuse control for the public endpoints).
// Buckets and hourly limits are env-tunable; defaults are generous for real
// agents and far below anything a flood needs.
import { incrementCounter } from "./store.js";

const WINDOW_SEC = 3600;
const LIMITS = {
  quote: Number(process.env.HFA_RL_QUOTE_PER_HOUR || 20),
  write: Number(process.env.HFA_RL_WRITE_PER_HOUR || 60),
  mcp: Number(process.env.HFA_RL_MCP_PER_HOUR || 300),
};

export function clientIp(req) {
  const fwd = req.headers?.["x-forwarded-for"] || req.headers?.["X-Forwarded-For"] || "";
  const first = String(fwd).split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unknown";
}

// Returns null when allowed, or { retryAfterSec } when the limit is exceeded.
export async function rateLimitExceeded(req, bucket) {
  const limit = LIMITS[bucket] ?? 60;
  const nowSec = Math.floor(Date.now() / 1000);
  const window = Math.floor(nowSec / WINDOW_SEC);
  const key = `${bucket}:${clientIp(req)}:${window}`;
  const n = await incrementCounter(key, WINDOW_SEC);
  if (n > limit) {
    return { retryAfterSec: WINDOW_SEC - (nowSec % WINDOW_SEC), limit };
  }
  return null;
}

export function sendRateLimited(res, info) {
  res.statusCode = 429;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Retry-After", String(info.retryAfterSec));
  res.end(JSON.stringify({ error: "rate_limited", message: `Too many requests in this bucket (limit ${info.limit}/hour). Retry after ${info.retryAfterSec}s.`, retry_after_sec: info.retryAfterSec }, null, 2));
}
