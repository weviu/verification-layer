/**
 * Core types for the Verification Layer.
 *
 * These types represent the validated, structured data that
 * enters the verification pipeline. They are derived from
 * the Zod schemas defined in schema/submission.ts.
 *
 * IMPORTANT: These types must stay in sync with the Zod schemas.
 * The schemas are the source of truth; these types are inferred from them.
 */

import type { z } from "zod";
import type {
  SubmissionEntrySchema,
  MetadataNodeSignatureSchema,
  SubmissionMetadataSchema,
  MixnetSubmissionSchema,
} from "../schema/submission.js";

// --- Inferred types from Zod schemas ---

/** A single submission entry from a Mixnet node */
export type SubmissionEntry = z.infer<typeof SubmissionEntrySchema>;

/** A node signature within metadata */
export type MetadataNodeSignature = z.infer<typeof MetadataNodeSignatureSchema>;

/** Metadata attached to a Mixnet submission */
export type SubmissionMetadata = z.infer<typeof SubmissionMetadataSchema>;

/** The full Mixnet submission payload (top-level input) */
export type MixnetSubmission = z.infer<typeof MixnetSubmissionSchema>;

// --- Validation result types ---

/** Represents a successful structural validation */
export interface ValidationSuccess {
  readonly valid: true;
  readonly data: MixnetSubmission;
}

/** A single validation error detail */
export interface ValidationErrorDetail {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

/** Represents a failed structural validation */
export interface ValidationFailure {
  readonly valid: false;
  readonly errors: readonly ValidationErrorDetail[];
}

/** Union type for validation results */
export type ValidationResult = ValidationSuccess | ValidationFailure;
