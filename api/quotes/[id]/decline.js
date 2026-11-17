import { declineQuote } from "../../../lib/tools.js";
import { readJsonBody, sendJson, handleOptions, bearerOf } from "../../../lib/http.js";

// POST /api/quotes/{id}/decline
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const body = (await readJsonBody(req)) || {};
  const out = await declineQuote({ quote_id: req.query?.id, reason: body.reason, access_token: body.access_token || bearerOf(req) || undefined });
  return sendJson(res, out.isError ? 400 : 200, out);
}
