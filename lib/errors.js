export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 502) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class ValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}
