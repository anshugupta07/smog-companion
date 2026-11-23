import { HTTP_STATUS } from "../js/constants.js";
import { ApiError } from "../js/errors.js";

/**
 * Reads a request body as text, rejecting early once it exceeds `maxBytes`.
 * @param {import("node:http").IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<string>}
 * @throws {ApiError} With status 413 when the body is too large.
 */
export function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(new ApiError("Body too large", HTTP_STATUS.payloadTooLarge));
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    let settled = false;
    /** @param {() => void} finish */
    const settleOnce = (finish) => {
      if (!settled) {
        settled = true;
        finish();
      }
    };
    req.on("data", (/** @type {Buffer} */ chunk) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > maxBytes) {
        chunks.length = 0;
        settleOnce(() => reject(new ApiError("Body too large", HTTP_STATUS.payloadTooLarge)));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => settleOnce(() => resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", (error) => settleOnce(() => reject(error)));
  });
}
