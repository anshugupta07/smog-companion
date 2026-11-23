/**
 * Smog Companion - named error types, shared by the browser and the server
 * so callers can tell a bad request from a failing upstream service.
 */

/** An upstream service (AI provider, air quality API) failed or answered badly. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] HTTP status to report when the error reaches a response.
   */
  constructor(message, status = 502) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The input is not acceptable (bad endpoint, out-of-range value, too-short query). */
export class ValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}
