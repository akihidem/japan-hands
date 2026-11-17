import { storageBackend } from "../lib/store.js";
import { sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  return sendJson(res, 200, {
    ok: true,
    service: "japan-hands",
    storage_backend: storageBackend,
    time: new Date().toISOString(),
  });
}
