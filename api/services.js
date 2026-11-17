import { catalogView } from "../lib/tools.js";
import { sendJson, handleOptions } from "../lib/http.js";

// GET /api/services (also /catalog) — the machine-readable catalog.
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  return sendJson(res, 200, catalogView());
}
