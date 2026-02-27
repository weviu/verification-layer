/**
 * Zod schemas for Mixnet submission validation.
 *
 * These schemas define the STRICT input format accepted by
 * the Verification Layer. They enforce:
 *   - Required fields are present
 *   - Correct data types and encodings
 *   - No implicit coercion (Zod strict mode)
 *
 * bytes32 hex format: "0x" followed by exactly 64 hex characters (lowercase or uppercase)
 *
 * IMPORTANT:
 *   - These schemas perform STRUCTURAL validation only.
 *   - No cryptographic verification happens here.
 *   - No Merkle root reconstruction, no ZK proof verification.
 */

import { z } from "zod";

// --- Reusable patterns ---

/**
 * bytes32 hex string: "0x" prefix + exactly 64 hex characters.
 * Example: "0xabc123...def456" (66 chars total)
 */
const BYTES32_HEX_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Validates a bytes32 hex string.
 * Rejects empty strings, wrong length, missing prefix, non-hex characters.
 */
const bytes32Hex = z
  .string()
  .regex(
    BYTES32_HEX_PATTERN,
    "Must be a bytes32 hex string: '0x' followed by exactly 64 hex characters"
  );

// --- Submission entry schema ---

/**
 * A single submission from a Mixnet node within a round.
 *
 * Each entry represents one node's contribution:
 *   - nodeId: identifies the node
 *   - encryptedVote: the encrypted vote data (hex-encoded)
 *   - tracker: a tracking identifier for this vote (hex-encoded)
 *   - merkleProof: array of hashes proving inclusion in the Merkle tree
 */
export const SubmissionEntrySchema = z.object({
  nodeId: z
    .string()
    .min(1, "nodeId must be a non-empty string"),

  encryptedVote: z
    .string()
    .min(1, "encryptedVote must be a non-empty string")
    .regex(
      /^0x[0-9a-fA-F]+$/,
      "encryptedVote must be a hex-encoded string with '0x' prefix"
    ),

  tracker: z
    .string()
    .min(1, "tracker must be a non-empty string")
    .regex(
      /^0x[0-9a-fA-F]+$/,
      "tracker must be a hex-encoded string with '0x' prefix"
    ),

  merkleProof: z
    .array(bytes32Hex)
    .min(1, "merkleProof must contain at least one hash"),
});

// --- Metadata schemas ---

/**
 * A node signature entry within metadata.
 * Contains the signing node's ID and its hex-encoded signature.
 */
export const MetadataNodeSignatureSchema = z.object({
  nodeId: z
    .string()
    .min(1, "signature nodeId must be a non-empty string"),

  signature: z
    .string()
    .min(1, "signature must be a non-empty string")
    .regex(
      /^0x[0-9a-fA-F]+$/,
      "signature must be a hex-encoded string with '0x' prefix"
    ),
});

/**
 * Metadata attached to a Mixnet round submission.
 *
 *   - nodeSignatures: signatures from participating nodes
 *   - version: protocol version string (e.g. "1.0.0")
 *   - timestamp: submission timestamp as ISO 8601 string
 */
export const SubmissionMetadataSchema = z.object({
  nodeSignatures: z
    .array(MetadataNodeSignatureSchema)
    .min(1, "At least one node signature is required"),

  version: z
    .string()
    .min(1, "version must be a non-empty string"),

  timestamp: z
    .string()
    .min(1, "timestamp must be a non-empty string")
    .refine(
      (val: string) => {
        const parsed = Date.parse(val);
        return !Number.isNaN(parsed);
      },
      { message: "timestamp must be a valid ISO 8601 date string" }
    ),
});

// --- Top-level submission schema ---

/**
 * The complete Mixnet round submission.
 *
 * This is the top-level payload sent by a Mixnet node
 * to the Verification Layer's ingestion endpoint.
 *
 * Fields:
 *   - electionId: bytes32 hex identifying the election
 *   - roundId: integer round number (>= 1)
 *   - merkleRoot: bytes32 hex of the claimed Merkle root
 *   - zkProof: hex-encoded zero-knowledge proof
 *   - submissions: array of per-node submission entries
 *   - metadata: round metadata including signatures and timestamp
 */
export const MixnetSubmissionSchema = z
  .object({
    electionId: bytes32Hex,

    roundId: z
      .number()
      .int("roundId must be an integer")
      .min(1, "roundId must be >= 1"),

    merkleRoot: bytes32Hex,

    zkProof: z
      .string()
      .min(1, "zkProof must be a non-empty string")
      .regex(
        /^0x[0-9a-fA-F]+$/,
        "zkProof must be a hex-encoded string with '0x' prefix"
      ),

    submissions: z
      .array(SubmissionEntrySchema)
      .min(1, "At least one submission entry is required"),

    metadata: SubmissionMetadataSchema,
  });
