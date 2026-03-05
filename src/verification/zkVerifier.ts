/**
 * Zero-Knowledge Proof Verification Interface and Stub
 *
 * This module defines the interface for ZK proof verification
 * and provides a FAIL-CLOSED stub implementation.
 *
 * IMPORTANT:
 *   - The stub REJECTS all proofs by default.
 *   - This is intentional: fail closed, never pass unverified data.
 *   - When the actual ZK circuit details are available, implement
 *     a real verifier that satisfies the ZkVerifier interface.
 *
 * The ZK proof must verify that:
 *   1. No votes were added to the round
 *   2. No votes were removed from the round
 *   3. The shuffle was performed correctly
 *
 * A ZK proof failure is a HARD REJECTION of the entire round.
 */

import type { MixnetSubmission } from "../types/index.js";

/**
 * The result of a ZK proof verification attempt.
 */
export interface ZkVerificationResult {
  /** Whether the proof verified successfully */
  readonly valid: boolean;
  /** Human-readable reason (especially on failure) */
  readonly reason: string;
}

/**
 * Interface for ZK proof verifiers.
 *
 * Any implementation must:
 *   - Accept the full submission data (for context)
 *   - Return an explicit result with a reason
 *   - Never throw on invalid proofs (return { valid: false } instead)
 *   - Only throw on internal/system errors
 */
export interface ZkVerifier {
  /**
   * Verify the ZK proof attached to a submission.
   *
   * @param submission - The full, structurally-valid submission.
   * @param derivedMerkleRoot - The Merkle root derived by the VL.
   * @returns ZkVerificationResult
   */
  verify(
    submission: MixnetSubmission,
    derivedMerkleRoot: string
  ): Promise<ZkVerificationResult>;
}

/**
 * STUB: Fail-closed ZK verifier.
 *
 * REJECTS all proofs unconditionally.
 * This is the correct default behavior until a real verifier is implemented.
 *
 * To enable a real verifier, implement the ZkVerifier interface and
 * pass it to the verification pipeline.
 */
export class FailClosedZkVerifier implements ZkVerifier {
  async verify(
    _submission: MixnetSubmission,
    _derivedMerkleRoot: string
  ): Promise<ZkVerificationResult> {
    return {
      valid: false,
      reason:
        "ZK verification stub: no real verifier implemented. " +
        "Rejecting by default (fail-closed). " +
        "Replace FailClosedZkVerifier with a real implementation when ZK circuit details are available.",
    };
  }
}

/**
 * PASSTHROUGH: Accepts all ZK proofs.
 *
 * WARNING: This verifier is for DEVELOPMENT AND TESTING ONLY.
 * It must NEVER be used in production.
 * It accepts all proofs without verification.
 *
 * Controlled via the VL_ZK_MODE environment variable:
 *   - "strict" (default): uses FailClosedZkVerifier
 *   - "passthrough": uses PassthroughZkVerifier (DEVELOPMENT ONLY)
 */
export class PassthroughZkVerifier implements ZkVerifier {
  async verify(
    _submission: MixnetSubmission,
    _derivedMerkleRoot: string
  ): Promise<ZkVerificationResult> {
    return {
      valid: true,
      reason:
        "ZK verification SKIPPED (passthrough mode). " +
        "WARNING: This is for development only. Not safe for production.",
    };
  }
}

/**
 * Create the appropriate ZK verifier based on configuration.
 *
 * Reads VL_ZK_MODE from the environment:
 *   - "strict" (default): FailClosedZkVerifier (rejects everything)
 *   - "passthrough": PassthroughZkVerifier (accepts everything, dev only)
 *
 * Any other value is treated as an error and falls back to strict.
 */
export function createZkVerifier(): ZkVerifier {
  const mode = process.env.VL_ZK_MODE ?? "strict";

  switch (mode) {
    case "passthrough":
      return new PassthroughZkVerifier();
    case "strict":
      return new FailClosedZkVerifier();
    default:
      // Unknown mode: fail closed
      return new FailClosedZkVerifier();
  }
}
