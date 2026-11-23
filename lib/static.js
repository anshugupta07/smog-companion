/**
 * Static file serving for the three public locations only: index.html, css/ and js/.
 * Responses carry a strong ETag (304 on a match) and are compressed with Brotli or gzip.
 * Compressed bodies are cached in memory and rebuilt only when the file's mtime changes.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { HTTP_STATUS } from "../js/constants.js";
import { send } from "./http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIRS = new Set(["css", "js"]);
const MIN_COMPRESS_BYTES = 512;
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
});

/**
 * Maps a URL path to a file under the project root, only for index.html, css/ and js/.
 * @param {string} urlPath
 * @param {string} [root]
 * @returns {string|null} The absolute file path, or null if the path is not allowed.
 */
function resolvePublicFile(urlPath, root = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) {
    return null;
  }
  const top = path.relative(root, full).split(path.sep)[0];
  if (rel !== "index.html" && !PUBLIC_DIRS.has(top)) {
    return null;
  }
  return full;
}

/**
 * Picks the best supported encoding from an Accept-Encoding header.
 * @param {string|string[]|undefined} header
 * @returns {"br"|"gzip"|"identity"}
 */
function chooseEncoding(header) {
  const accepted = String(header || "")
    .toLowerCase()
    .split(",")
    .map((part) => part.split(";")[0].trim());
  if (accepted.includes("br")) {
    return "br";
  }
  if (accepted.includes("gzip")) {
    return "gzip";
  }
  return "identity";
}

/**
 * @typedef {{mtimeMs: number, type: string, etag: string, compressed: boolean,
 *   bodies: Record<"identity"|"gzip"|"br", Buffer>}} CacheEntry
 */

/**
 * Precomputes the ETag and compressed bodies of a file.
 * @param {Buffer} raw
 * @param {import("node:fs").Stats} stat
 * @param {string} ext
 * @returns {CacheEntry}
 */
function buildEntry(raw, stat, ext) {
  const compressible = raw.length >= MIN_COMPRESS_BYTES;
  return {
    mtimeMs: stat.mtimeMs,
    type: /** @type {Record<string, string>} */ (CONTENT_TYPES)[ext] || "application/octet-stream",
    etag: `"${crypto.createHash("sha1").update(raw).digest("base64url")}"`,
    bodies: {
      identity: raw,
      gzip: compressible ? zlib.gzipSync(raw, { level: 9 }) : raw,
      br: compressible
        ? zlib.brotliCompressSync(raw, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 },
          })
        : raw,
    },
    compressed: compressible,
  };
}

/**
 * Loads a file into the cache, rebuilding it only when its modification time changes.
 * @param {Map<string, CacheEntry>} cache
 * @param {string} file
 * @returns {Promise<CacheEntry|null>} The entry, or null when the path is not a readable file.
 */
async function loadEntry(cache, file) {
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) {
      return null;
    }
    const cached = cache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached;
    }
    const entry = buildEntry(await fs.promises.readFile(file), stat, path.extname(file));
    cache.set(file, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Response headers for one file in one encoding.
 * @param {string} file
 * @param {CacheEntry} entry
 * @param {"br"|"gzip"|"identity"} encoding
 * @returns {Record<string, string|number>}
 */
function responseHeaders(file, entry, encoding) {
  /** @type {Record<string, string|number>} */
  const headers = {
    "Content-Type": entry.type,
    "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=3600, must-revalidate",
    ETag: encoding === "identity" ? entry.etag : entry.etag.replace(/"$/, `-${encoding}"`),
    Vary: "Accept-Encoding",
  };
  if (encoding !== "identity") {
    headers["Content-Encoding"] = encoding;
  }
  return headers;
}

/**
 * Creates the handler that serves the public files with ETag and compression.
 * @param {string} [root]
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, pathname: string) => Promise<void>}
 */
function createStaticHandler(root = ROOT) {
  /** @type {Map<string, CacheEntry>} */
  const cache = new Map();

  return async function serve(req, res, pathname) {
    const file = resolvePublicFile(pathname, root);
    const entry = file ? await loadEntry(cache, file) : null;
    if (!file || !entry) {
      return send(res, HTTP_STATUS.notFound, "Not found");
    }
    const encoding = entry.compressed ? chooseEncoding(req.headers["accept-encoding"]) : "identity";
    const headers = responseHeaders(file, entry, encoding);
    if (req.headers["if-none-match"] === headers.ETag) {
      return send(res, HTTP_STATUS.notModified, "", headers);
    }
    const body = entry.bodies[encoding];
    headers["Content-Length"] = body.length;
    return send(res, HTTP_STATUS.ok, req.method === "HEAD" ? "" : body, headers);
  };
}

export { createStaticHandler, resolvePublicFile, chooseEncoding };
