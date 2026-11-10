/**
 * Boowie files: the user's own book files in Cloudflare R2, so another device of the account can download them.
 *
 * Every request carries the Supabase session of the account (`Authorization: Bearer <access token>`). The
 * Worker asks Supabase who that is and only ever touches that account's folder, `u/<user id>/`. A book lives in
 * `u/<user id>/<sha-256 of its key>/`: its files `0`, `1`, … and `manifest.json`, written last, once every file
 * is there (a book without a manifest is not downloadable yet).
 *
 *   GET    /v1/usage                                   → { bytes, quota }
 *   GET    /v1/books/:key                              → the manifest, or 404
 *   PUT    /v1/books/:key                              ← the manifest (checked against the stored files)
 *   DELETE /v1/books/:key                              the book's files
 *   PUT    /v1/books/:key/files/:n                     ← a file of up to 95 MB
 *   GET    /v1/books/:key/files/:n                     → the file (Range supported)
 *   POST   /v1/books/:key/files/:n/uploads             ← { size } → { uploadId } (larger files, in parts)
 *   PUT    /v1/books/:key/files/:n/uploads/:id/:part   ← a part → { etag }
 *   POST   /v1/books/:key/files/:n/uploads/:id/complete ← { parts: [{ partNumber, etag }] }
 *   DELETE /v1/books/:key/files/:n/uploads/:id         abandon an upload
 *
 * Bindings: BUCKET (R2), SUPABASE_URL, QUOTA_BYTES (per account; 0 = no limit), SUPABASE_KEY (optional: the
 * project's publishable key when a request doesn't bring it in an `apikey` header),
 * ALLOWED_ORIGINS (comma-separated; `*` inside a name matches any letters, digits and dashes).
 */

const SINGLE_MAX = 95 * 1024 * 1024;
const AUTH_TTL_MS = 5 * 60 * 1000;
/** Access token → { id, at }: a multi-part upload asks Supabase once, not for every part. */
const sessions = new Map();

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return json({ error: e instanceof HttpError ? e.message : "internal error" }, status, cors);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.some((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+")}$`, "i").test(origin));
  return ok
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Range, apikey",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, ETag",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The account the request is for, from its Supabase session. */
async function userOf(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  if (!/^Bearer \S+$/.test(auth)) throw new HttpError(401, "sign in first");
  const token = auth.slice(7);
  const cached = sessions.get(token);
  if (cached && Date.now() - cached.at < AUTH_TTL_MS) return cached.id;
  // The project's publishable key comes with the request (the app has it); SUPABASE_URL is fixed here, so only
  // that project can vouch for a session.
  const apikey = request.headers.get("apikey") || env.SUPABASE_KEY || "";
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: auth } });
  if (!res.ok) throw new HttpError(401, "the session is not valid");
  const user = await res.json();
  if (!user?.id) throw new HttpError(401, "the session is not valid");
  if (sessions.size > 500) sessions.clear();
  sessions.set(token, { id: user.id, at: Date.now() });
  return user.id;
}

async function usage(env, user) {
  let bytes = 0;
  let cursor;
  do {
    const list = await env.BUCKET.list({ prefix: `u/${user}/`, cursor });
    for (const o of list.objects) bytes += o.size;
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return bytes;
}

async function checkQuota(env, user, size) {
  const quota = Number(env.QUOTA_BYTES || 0);
  if (!quota) return;
  if ((await usage(env, user)) + size > quota) throw new HttpError(413, "the account's cloud space is full");
}

async function route(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "v1") throw new HttpError(404, "not found");
  const user = await userOf(request, env);
  const method = request.method;

  if (parts[1] === "usage" && parts.length === 2 && method === "GET") {
    return json({ bytes: await usage(env, user), quota: Number(env.QUOTA_BYTES || 0) });
  }
  if (parts[1] !== "books" || !parts[2] || parts[2].length > 300) throw new HttpError(404, "not found");
  const base = `u/${user}/${await sha256(parts[2])}`;

  // The book.
  if (parts.length === 3) {
    if (method === "GET") {
      const obj = await env.BUCKET.get(`${base}/manifest.json`);
      return obj ? new Response(obj.body, { headers: { "Content-Type": "application/json" } }) : json({ error: "not in the cloud" }, 404);
    }
    if (method === "PUT") {
      const manifest = await request.json().catch(() => null);
      if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > 2000) throw new HttpError(400, "bad manifest");
      for (const [i, f] of manifest.files.entries()) {
        const head = await env.BUCKET.head(`${base}/${i}`);
        if (!head || head.size !== f.size) throw new HttpError(409, `file ${i} is missing or incomplete`);
      }
      await env.BUCKET.put(`${base}/manifest.json`, JSON.stringify({ ...manifest, key: parts[2], uploadedAt: Date.now() }), { httpMetadata: { contentType: "application/json" } });
      return json({ ok: true });
    }
    if (method === "DELETE") {
      let cursor;
      do {
        const list = await env.BUCKET.list({ prefix: `${base}/`, cursor });
        if (list.objects.length) await env.BUCKET.delete(list.objects.map((o) => o.key));
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      return json({ ok: true });
    }
  }

  // A file of the book.
  if (parts[3] !== "files" || !/^\d{1,4}$/.test(parts[4] ?? "")) throw new HttpError(404, "not found");
  const objectKey = `${base}/${Number(parts[4])}`;

  if (parts.length === 5) {
    if (method === "GET") {
      const range = request.headers.get("Range");
      const m = range && /^bytes=(\d+)-(\d*)$/.exec(range);
      const obj = await env.BUCKET.get(objectKey, m ? { range: m[2] ? { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 } : { offset: Number(m[1]) } } : undefined);
      if (!obj) throw new HttpError(404, "no such file");
      const headers = { "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream", "Accept-Ranges": "bytes", ETag: obj.httpEtag };
      if (m && obj.range) {
        const start = obj.range.offset ?? 0;
        const length = obj.range.length ?? obj.size - start;
        return new Response(obj.body, { status: 206, headers: { ...headers, "Content-Length": String(length), "Content-Range": `bytes ${start}-${start + length - 1}/${obj.size}` } });
      }
      return new Response(obj.body, { headers: { ...headers, "Content-Length": String(obj.size) } });
    }
    if (method === "PUT") {
      const size = Number(request.headers.get("Content-Length") ?? NaN);
      if (!Number.isFinite(size) || size > SINGLE_MAX) throw new HttpError(411, "send larger files in parts");
      await checkQuota(env, user, size);
      await env.BUCKET.put(objectKey, request.body, { httpMetadata: { contentType: request.headers.get("Content-Type") ?? "application/octet-stream" } });
      return json({ ok: true });
    }
  }

  if (parts[5] !== "uploads") throw new HttpError(404, "not found");
  if (parts.length === 6 && method === "POST") {
    const { size, type } = await request.json().catch(() => ({}));
    if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, "the file's size is needed");
    await checkQuota(env, user, size);
    const upload = await env.BUCKET.createMultipartUpload(objectKey, { httpMetadata: { contentType: type || "application/octet-stream" } });
    return json({ uploadId: upload.uploadId });
  }
  const upload = env.BUCKET.resumeMultipartUpload(objectKey, parts[6] ?? "");
  if (parts.length === 8 && parts[7] === "complete" && method === "POST") {
    const { parts: done } = await request.json().catch(() => ({}));
    if (!Array.isArray(done) || !done.length) throw new HttpError(400, "the parts are needed");
    try {
      await upload.complete(done.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
    } catch (e) {
      throw new HttpError(409, `could not finish the upload: ${e?.message ?? e}`);
    }
    return json({ ok: true });
  }
  if (parts.length === 8 && /^\d{1,5}$/.test(parts[7]) && method === "PUT") {
    const size = Number(request.headers.get("Content-Length") ?? NaN);
    if (!Number.isFinite(size) || size > SINGLE_MAX) throw new HttpError(411, "parts are up to 95 MB");
    try {
      const part = await upload.uploadPart(Number(parts[7]), request.body);
      return json({ partNumber: part.partNumber, etag: part.etag });
    } catch (e) {
      // An upload that is gone (finished, abandoned, or older than a week) starts again from the client.
      throw new HttpError(404, `no such upload: ${e?.message ?? e}`);
    }
  }
  if (parts.length === 7 && method === "DELETE") {
    await upload.abort().catch(() => undefined);
    return json({ ok: true });
  }
  throw new HttpError(404, "not found");
}
