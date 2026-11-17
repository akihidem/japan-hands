import { getEvidence } from "../../../lib/tools.js";
import { sendJson, handleOptions, bearerOf } from "../../../lib/http.js";

// GET /api/tasks/{id}/evidence
export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  const out = await getEvidence({ task_id: req.query?.id, access_token: req.query?.access_token || bearerOf(req) || undefined });
  return sendJson(res, out.isError ? 404 : 200, out);
}
