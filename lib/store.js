// Ledger storage adapter.
// Production: Vercel KV / Upstash Redis via REST (KV_REST_API_URL + KV_REST_API_TOKEN).
// Fallback: a single JSON file (local dev: app/data/store.json; on Vercel without KV:
// /tmp — ephemeral, so configure KV before real traffic; see README).
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const useKv = Boolean(kvUrl && kvToken);

const localFile =
  process.env.HFA_STORE_FILE ||
  (process.env.VERCEL
    ? "/tmp/hfa-store.json"
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "store.json"));

async function kvCommand(cmd) {
  const res = await fetch(kvUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`KV error: ${res.status}`);
  const data = await res.json();
  return data.result;
}

async function readFileStore() {
  try {
    const raw = await fs.readFile(localFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return { quotes: {}, tasks: {} };
  }
}

async function writeFileStore(store) {
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await fs.writeFile(localFile, JSON.stringify(store, null, 2));
}

export const storageBackend = useKv ? "vercel-kv" : "local-file";

export async function putRecord(kind, id, record) {
  if (useKv) {
    await kvCommand(["SET", `hfa:${kind}:${id}`, JSON.stringify(record)]);
    return;
  }
  const store = await readFileStore();
  store[kind][id] = record;
  await writeFileStore(store);
}

export async function getRecord(kind, id) {
  if (useKv) {
    const raw = await kvCommand(["GET", `hfa:${kind}:${id}`]);
    return raw ? JSON.parse(raw) : null;
  }
  const store = await readFileStore();
  return store[kind][id] || null;
}
