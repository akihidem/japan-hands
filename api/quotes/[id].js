import { getTaskStatus } from "../../lib/tools.js";
import { sendJson, handleOptions, bearerOf } from "../../lib/http.js";

// GET /api/quotes/{id} — status of a quote (or task) by id.
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  const out = await getTaskStatus({ id: req.query?.id, access_token: req.query?.access_token || bearerOf(req) || undefined, full: req.query?.full === "true" });
  return sendJson(res, out.isError ? 404 : 200, out);
}
