/**
 * Structural validation for Mixnet submissions.
 *
 * This module performs Phase 1 validation ONLY:
 *   - Required fields present
 *   - Correct data types and encodings
 *   - No implicit coercion
 *
 * It does NOT:
 *   - Verify Merkle roots or proofs
 *   - Verify ZK proofs
 *   - Check replay / duplicates
 *   - Submit anything to the blockchain
 *
 * Returns a discriminated union: ValidationSuccess | ValidationFailure
 */

import { z } from "zod";
import { MixnetSubmissionSchema } from "../schema/submission.js";
import type { ValidationResult, ValidationErrorDetail } from "../types/index.js";
import { logger } from "../logger/index.js";

/**
 * Validate an unknown input against the MixnetSubmission schema.
 *
 * @param input - The raw, untrusted input (parsed JSON body)
 * @returns ValidationResult - either { valid: true, data } or { valid: false, errors }
 */
export function validateSubmission(input: unknown): ValidationResult {
  // Guard: input must be a non-null object (not an array, not a primitive)
  if (input === null || input === undefined) {
    return {
      valid: false,
      errors: [
        {
          field: "body",
          message: "Request body must be a non-null JSON object",
          code: "INVALID_TYPE",
        },
      ],
    };
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      errors: [
        {
          field: "body",
          message: "Request body must be a JSON object, not an array or primitive",
          code: "INVALID_TYPE",
        },
      ],
    };
  }

  const result = MixnetSubmissionSchema.safeParse(input);

  if (result.success) {
    logger.info("Structural validation passed", {
      electionId: result.data.electionId,
      roundId: result.data.roundId,
      submissionCount: result.data.submissions.length,
    });

    return {
      valid: true,
      data: result.data,
    };
  }

  // Map Zod errors to our ValidationErrorDetail format
  const errors: ValidationErrorDetail[] = mapZodErrors(result.error);

  logger.warn("Structural validation failed", {
    errorCount: errors.length,
    errors,
  });

  return {
    valid: false,
    errors,
  };
}

/**
 * Map ZodError issues to our ValidationErrorDetail format.
 * Preserves the full field path for each error.
 */
function mapZodErrors(zodError: z.ZodError): ValidationErrorDetail[] {
  return zodError.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "body";
    return {
      field,
      message: issue.message,
      code: issue.code,
    };
  });
}
