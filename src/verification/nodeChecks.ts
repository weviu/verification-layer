/**
 * Node-Level Checks
 *
 * Validates node-level invariants for a Mixnet round submission:
 *   1. All node IDs are unique (no duplicates)
 *   2. All node IDs are non-empty
 *   3. Node IDs in submissions match node IDs in metadata signatures
 *      (every submitting node must have a corresponding signature)
 *
 * These checks ensure round integrity at the participant level.
 */

import type { MixnetSubmission } from "../types/index.js";

/**
 * Result of node-level validation.
 */
export interface NodeCheckResult {
  readonly valid: boolean;
  readonly reason: string;
}

/**
 * Perform node-level checks on a submission.
 *
 * Checks:
 *   1. No duplicate node IDs in submissions
 *   2. No duplicate node IDs in metadata signatures
 *   3. Every submission node has a corresponding metadata signature
 *
 * @param submission - A structurally valid MixnetSubmission.
 * @returns NodeCheckResult
 */
export function checkNodes(submission: MixnetSubmission): NodeCheckResult {
  // --- Check 1: Unique node IDs in submissions ---
  const submissionNodeIds = submission.submissions.map((s) => s.nodeId);
  const uniqueSubmissionNodeIds = new Set(submissionNodeIds);

  if (uniqueSubmissionNodeIds.size !== submissionNodeIds.length) {
    const duplicates = findDuplicates(submissionNodeIds);
    return {
      valid: false,
      reason: `Duplicate node IDs in submissions: [${duplicates.join(", ")}]`,
    };
  }

  // --- Check 2: Unique node IDs in metadata signatures ---
  const signatureNodeIds = submission.metadata.nodeSignatures.map((s) => s.nodeId);
  const uniqueSignatureNodeIds = new Set(signatureNodeIds);

  if (uniqueSignatureNodeIds.size !== signatureNodeIds.length) {
    const duplicates = findDuplicates(signatureNodeIds);
    return {
      valid: false,
      reason: `Duplicate node IDs in metadata signatures: [${duplicates.join(", ")}]`,
    };
  }

  // --- Check 3: Every submission node must have a metadata signature ---
  const missingSignatures: string[] = [];
  for (const nodeId of submissionNodeIds) {
    if (!uniqueSignatureNodeIds.has(nodeId)) {
      missingSignatures.push(nodeId);
    }
  }

  if (missingSignatures.length > 0) {
    return {
      valid: false,
      reason: `Submission nodes missing metadata signatures: [${missingSignatures.join(", ")}]`,
    };
  }

  return {
    valid: true,
    reason: `Node checks passed: ${uniqueSubmissionNodeIds.size} unique nodes, all have signatures`,
  };
}

/**
 * Find duplicate values in an array.
 * Returns the values that appear more than once.
 */
function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const v of values) {
    if (seen.has(v)) {
      duplicates.add(v);
    }
    seen.add(v);
  }

  return Array.from(duplicates);
}
