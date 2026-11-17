import { cancelTask } from "../lib/tools.js";
import { readJsonBody, sendJson, handleOptions, bearerOf } from "../lib/http.js";
import { rateLimitExceeded, sendRateLimited } from "../lib/ratelimit.js";

// POST /api/cancel — {id, access_token, reason}: cancel a quote or a task.
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const rl = await rateLimitExceeded(req, "write");
  if (rl) return sendRateLimited(res, rl);
  const body = await readJsonBody(req);
  if (body === null) return sendJson(res, 400, { error: "invalid_json" });
  const out = await cancelTask({ ...body, authorization: bearerOf(req) });
  return sendJson(res, out.isError ? 400 : 200, out);
}
