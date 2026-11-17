import { requestQuote } from "../lib/tools.js";
import { readJsonBody, sendJson, handleOptions } from "../lib/http.js";
import { rateLimitExceeded, sendRateLimited } from "../lib/ratelimit.js";

// POST /api/quote — REST mirror of the MCP request_quote tool.
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const rl = await rateLimitExceeded(req, "quote");
  if (rl) return sendRateLimited(res, rl);
  const body = await readJsonBody(req);
  if (body === null) return sendJson(res, 400, { error: "invalid_json" });
  const out = await requestQuote(body);
  return sendJson(res, out.isError ? 400 : 201, out);
}
