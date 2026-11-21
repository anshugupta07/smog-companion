import { SECURITY_HEADERS } from "./security.js";

/** Writes a response with the security headers applied. `extra` headers win over defaults. */
function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

/** Writes a JSON response that must never be cached. */
function sendJson(res, status, payload, extra = {}) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "close",
    ...extra,
  });
}

const isJsonRequest = (req) =>
  String(req.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";

export { send, sendJson, isJsonRequest };
