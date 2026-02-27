/**
 * Custom error classes for the Verification Layer.
 *
 * All errors are explicit. No silent failures.
 * Each error type carries structured information for logging and response.
 */

import type { ValidationErrorDetail } from "../types/index.js";

/**
 * Thrown when a submission fails structural validation.
 * Contains the full list of validation errors.
 */
export class StructuralValidationError extends Error {
  public readonly errors: readonly ValidationErrorDetail[];

  constructor(errors: readonly ValidationErrorDetail[]) {
    const summary = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    super(`Structural validation failed: ${summary}`);
    this.name = "StructuralValidationError";
    this.errors = errors;
  }
}

/**
 * Thrown when the request body is not valid JSON
 * or is not a JSON object.
 */
export class MalformedRequestError extends Error {
  constructor(detail: string) {
    super(`Malformed request: ${detail}`);
    this.name = "MalformedRequestError";
  }
}
