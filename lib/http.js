import { SECURITY_HEADERS } from "./security.js";

/**
 * Writes a response with the security headers applied. `extra` headers win over defaults.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {string|Buffer} body
 * @param {Record<string, string|number>} [extra]
 * @returns {void}
 */
function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

/**
 * Writes a JSON response that must never be cached.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {Record<string, string|number>} [extra]
 * @returns {void}
 */
function sendJson(res, status, payload, extra = {}) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "close",
    ...extra,
  });
}

/**
 * True when the request declares a JSON body.
 * @param {import("node:http").IncomingMessage} req
 * @returns {boolean}
 */
const isJsonRequest = (req) =>
  String(req.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";

export { send, sendJson, isJsonRequest };
