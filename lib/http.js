// Minimal raw-Node HTTP helpers so the same handlers run on Vercel
// (Node runtime) and under the local dev server (plain node:http).
export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel may pre-parse
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null; // invalid JSON
  }
}

export function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.end(body);
}

export function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return true;
  }
  return false;
}

export function bearerOf(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  return h.replace(/^Bearer\s+/i, "") || null;
}
