'use strict';
/**
 * Static file serving for the three public locations only: index.html, css/ and js/.
 * Responses carry a strong ETag (304 on a match) and are compressed with Brotli or gzip.
 * Compressed bodies are cached in memory and rebuilt only when the file's mtime changes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { send } = require('./http.js');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIRS = new Set(['css', 'js']);
const MIN_COMPRESS_BYTES = 512;
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
});

/** Maps a URL path to a file under ROOT, only for index.html, css/ and js/. Returns null if not allowed. */
function resolvePublicFile(urlPath, root = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null;
  const top = path.relative(root, full).split(path.sep)[0];
  if (rel !== 'index.html' && !PUBLIC_DIRS.has(top)) return null;
  return full;
}

/** Picks the best supported encoding from an Accept-Encoding header. */
function chooseEncoding(header) {
  const accepted = String(header || '').toLowerCase().split(',').map((part) => part.split(';')[0].trim());
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  return 'identity';
}

function buildEntry(raw, stat, ext) {
  const compressible = raw.length >= MIN_COMPRESS_BYTES;
  return {
    mtimeMs: stat.mtimeMs,
    type: CONTENT_TYPES[ext] || 'application/octet-stream',
    etag: `"${crypto.createHash('sha1').update(raw).digest('base64url')}"`,
    bodies: {
      identity: raw,
      gzip: compressible ? zlib.gzipSync(raw, { level: 9 }) : raw,
      br: compressible ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : raw,
    },
    compressed: compressible,
  };
}

/** @returns {(req, res, pathname:string) => Promise<void>} */
function createStaticHandler(root = ROOT) {
  const cache = new Map();

  async function load(file) {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return null;
    const cached = cache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
    const entry = buildEntry(await fs.promises.readFile(file), stat, path.extname(file));
    cache.set(file, entry);
    return entry;
  }

  return async function serve(req, res, pathname) {
    const file = resolvePublicFile(pathname, root);
    if (!file) return send(res, 404, 'Not found');
    let entry;
    try {
      entry = await load(file);
    } catch {
      entry = null;
    }
    if (!entry) return send(res, 404, 'Not found');

    const encoding = entry.compressed ? chooseEncoding(req.headers['accept-encoding']) : 'identity';
    const etag = encoding === 'identity' ? entry.etag : entry.etag.replace(/"$/, `-${encoding}"`);
    const headers = {
      'Content-Type': entry.type,
      'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600, must-revalidate',
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    if (encoding !== 'identity') headers['Content-Encoding'] = encoding;

    if (req.headers['if-none-match'] === etag) return send(res, 304, '', headers);
    const body = entry.bodies[encoding];
    headers['Content-Length'] = body.length;
    return send(res, 200, req.method === 'HEAD' ? '' : body, headers);
  };
}

module.exports = { createStaticHandler, resolvePublicFile, chooseEncoding };
