/**
 * Verification Pipeline (Phase 2)
 *
 * Orchestrates all cryptographic and logical verification steps
 * for a Mixnet round submission.
 *
 * Pipeline order (each step must pass before the next runs):
 *   1. Replay prevention check
 *   2. Node-level checks
 *   3. Canonical ordering of submissions
 *   4. Merkle tree construction (derive root)
 *   5. Merkle proof verification (each submission's proof vs. derived root)
 *   6. ZK proof verification
 *
 * On SUCCESS:
 *   - Returns the derived Merkle root
 *   - Marks the round as processed in the replay store
 *   - The round is eligible for blockchain commitment (Phase 3)
 *
 * On FAILURE:
 *   - Returns an explicit rejection reason
 *   - Does NOT mark the round as processed
 *   - Does NOT interact with the blockchain
 *
 * IMPORTANT:
 *   - This pipeline can run in isolation (no blockchain dependency)
 *   - Every failure is explicit and logged
 *   - No data is modified to "fix" errors
 *   - No partial rounds are accepted
 */

import type { MixnetSubmission } from "../types/index.js";
import { canonicalOrder } from "../crypto/ordering.js";
import {
  computeLeafHash,
  buildMerkleTree,
  getMerkleRoot,
  verifyMerkleProof,
} from "../crypto/merkle.js";
import { checkNodes } from "./nodeChecks.js";
import type { ZkVerifier } from "./zkVerifier.js";
import { ReplayPreventionStore } from "../store/replayStore.js";
import { logger } from "../logger/index.js";

// --- Result types ---

export interface VerificationSuccess {
  readonly verified: true;
  readonly electionId: string;
  readonly roundId: number;
  readonly derivedMerkleRoot: string;
  readonly submissionCount: number;
  readonly warnings: readonly string[];
}

export interface VerificationFailure {
  readonly verified: false;
  readonly electionId: string;
  readonly roundId: number;
  readonly step: string;
  readonly reason: string;
}

export type VerificationResult = VerificationSuccess | VerificationFailure;

// --- Pipeline ---

// TODO: Remove VL_ACCEPT_EMPTY_PROOFS once Mixnet produces Merkle proofs

export class VerificationPipeline {
  private readonly replayStore: ReplayPreventionStore;
  private readonly zkVerifier: ZkVerifier;
  private readonly acceptEmptyProofs: boolean;

  constructor(
    replayStore: ReplayPreventionStore,
    zkVerifier: ZkVerifier,
    acceptEmptyProofs: boolean = false
  ) {
    this.replayStore = replayStore;
    this.zkVerifier = zkVerifier;
    this.acceptEmptyProofs = acceptEmptyProofs;

    if (this.acceptEmptyProofs) {
      logger.warn(
        "DEVELOPMENT MODE: VL_ACCEPT_EMPTY_PROOFS=true. " +
        "Empty Merkle proofs will be accepted. " +
        "This mode MUST be disabled in production."
      );
    }
  }

  /**
   * Run the full verification pipeline on a structurally-valid submission.
   *
   * @param submission - Must have already passed Phase 1 structural validation.
   * @returns VerificationResult - binary outcome with details.
   */
  async verify(submission: MixnetSubmission): Promise<VerificationResult> {
    const { electionId, roundId } = submission;

    logger.info("Starting verification pipeline", { electionId, roundId });

    // --- Step 1: Replay prevention ---
    const replayResult = this.checkReplay(submission);
    if (!replayResult.verified) return replayResult;

    // --- Step 2: Node-level checks ---
    const nodeResult = this.checkNodeLevel(submission);
    if (!nodeResult.verified) return nodeResult;

    // --- Step 3: Canonical ordering ---
    const orderedSubmissions = canonicalOrder(submission.submissions);

    logger.info("Submissions ordered canonically", {
      electionId,
      roundId,
      count: orderedSubmissions.length,
    });

    // --- Step 4: Merkle tree construction ---
    const leafHashes = orderedSubmissions.map(computeLeafHash);
    const tree = buildMerkleTree(leafHashes);
    const derivedMerkleRoot = getMerkleRoot(tree);

    logger.info("Merkle tree constructed", {
      electionId,
      roundId,
      derivedMerkleRoot,
      leafCount: leafHashes.length,
      treeDepth: tree.length,
    });

    // --- Step 5: Merkle proof verification ---
    const warnings: string[] = [];
    const merkleResult = this.verifyMerkleProofs(
      submission,
      orderedSubmissions,
      derivedMerkleRoot,
      tree,
      warnings
    );
    if (!merkleResult.verified) return merkleResult;

    // --- Step 6: ZK proof verification ---
    const zkResult = await this.verifyZkProof(submission, derivedMerkleRoot);
    if (!zkResult.verified) return zkResult;

    // --- All checks passed ---

    // Mark as processed AFTER all verification passes
    this.replayStore.markProcessed(electionId, roundId);

    logger.info("Verification pipeline PASSED", {
      electionId,
      roundId,
      derivedMerkleRoot,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

    return {
      verified: true,
      electionId,
      roundId,
      derivedMerkleRoot,
      submissionCount: orderedSubmissions.length,
      warnings,
    };
  }

  // --- Individual step implementations ---

  private checkReplay(submission: MixnetSubmission): VerificationResult {
    const { electionId, roundId } = submission;

    if (this.replayStore.isProcessed(electionId, roundId)) {
      logger.warn("Replay detected: round already processed", {
        electionId,
        roundId,
      });

      return {
        verified: false,
        electionId,
        roundId,
        step: "REPLAY_PREVENTION",
        reason: `Round (${electionId}, ${roundId}) has already been processed. Duplicate submission rejected.`,
      };
    }

    logger.info("Replay check passed", { electionId, roundId });

    return {
      verified: true,
      electionId,
      roundId,
      derivedMerkleRoot: "", // placeholder, not used
      submissionCount: 0,
      warnings: [],
    };
  }

  private checkNodeLevel(submission: MixnetSubmission): VerificationResult {
    const { electionId, roundId } = submission;
    const result = checkNodes(submission);

    if (!result.valid) {
      logger.warn("Node-level check failed", {
        electionId,
        roundId,
        reason: result.reason,
      });

      return {
        verified: false,
        electionId,
        roundId,
        step: "NODE_CHECKS",
        reason: result.reason,
      };
    }

    logger.info("Node-level checks passed", {
      electionId,
      roundId,
      detail: result.reason,
    });

    return {
      verified: true,
      electionId,
      roundId,
      derivedMerkleRoot: "",
      submissionCount: 0,
      warnings: [],
    };
  }

  /**
   * Verify each submission's Merkle proof against the derived root.
   *
   * The canonical ordering determines each submission's leaf index.
   * The proof is verified positionally using that index.
   */
  /**
   * Verify each submission's Merkle proof against the derived root.
   *
   * If VL_ACCEPT_EMPTY_PROOFS is enabled and a submission has an empty
   * proof array, proof verification is skipped for that submission
   * with a warning. Non-empty proofs are always fully verified.
   *
   * TODO: Remove VL_ACCEPT_EMPTY_PROOFS once Mixnet produces Merkle proofs
   */
  private verifyMerkleProofs(
    submission: MixnetSubmission,
    orderedSubmissions: import("../types/index.js").SubmissionEntry[],
    derivedMerkleRoot: string,
    tree: Uint8Array[][],
    warnings: string[]
  ): VerificationResult {
    const { electionId, roundId } = submission;

    // Build a map from nodeId -> canonical index for the ordered submissions
    const nodeIdToIndex = new Map<string, number>();
    for (let i = 0; i < orderedSubmissions.length; i++) {
      nodeIdToIndex.set(orderedSubmissions[i]!.nodeId, i);
    }

    let bypassedCount = 0;

    for (const entry of submission.submissions) {
      const leafIndex = nodeIdToIndex.get(entry.nodeId);

      if (leafIndex === undefined) {
        // This should not happen if node checks passed, but fail explicitly
        return {
          verified: false,
          electionId,
          roundId,
          step: "MERKLE_PROOF_VERIFICATION",
          reason: `Node ${entry.nodeId}: not found in canonical ordering (internal error)`,
        };
      }

      // --- Development mode: bypass empty proofs if allowed ---
      // TODO: Remove VL_ACCEPT_EMPTY_PROOFS once Mixnet produces Merkle proofs
      if (entry.merkleProof.length === 0 && this.acceptEmptyProofs) {
        logger.warn("Merkle proof verification bypassed (development mode)", {
          electionId,
          roundId,
          nodeId: entry.nodeId,
        });
        bypassedCount++;
        continue;
      }

      // Compute the leaf hash for this submission
      const leafHash = computeLeafHash(entry);

      // Verify the submitted Merkle proof
      const proofValid = verifyMerkleProof(
        leafHash,
        entry.merkleProof,
        leafIndex,
        derivedMerkleRoot
      );

      if (!proofValid) {
        logger.warn("Merkle proof verification FAILED for node", {
          electionId,
          roundId,
          nodeId: entry.nodeId,
          leafIndex,
          proofLength: entry.merkleProof.length,
          expectedTreeDepth: tree.length - 1,
        });

        return {
          verified: false,
          electionId,
          roundId,
          step: "MERKLE_PROOF_VERIFICATION",
          reason: `Node ${entry.nodeId}: Merkle proof does not resolve to the derived root. ` +
            `Leaf index: ${leafIndex}, proof length: ${entry.merkleProof.length}, ` +
            `expected depth: ${tree.length - 1}`,
        };
      }
    }

    if (bypassedCount > 0) {
      warnings.push(
        `Merkle proof verification bypassed for ${bypassedCount} submission(s) because VL_ACCEPT_EMPTY_PROOFS=true`
      );
    }

    logger.info(bypassedCount > 0
      ? "Merkle proofs: some bypassed (development mode)"
      : "All Merkle proofs verified", {
      electionId,
      roundId,
      count: submission.submissions.length,
      bypassed: bypassedCount,
    });

    return {
      verified: true,
      electionId,
      roundId,
      derivedMerkleRoot,
      submissionCount: submission.submissions.length,
      warnings,
    };
  }

  private async verifyZkProof(
    submission: MixnetSubmission,
    derivedMerkleRoot: string
  ): Promise<VerificationResult> {
    const { electionId, roundId } = submission;

    const result = await this.zkVerifier.verify(submission, derivedMerkleRoot);

    if (!result.valid) {
      logger.warn("ZK proof verification FAILED", {
        electionId,
        roundId,
        reason: result.reason,
      });

      return {
        verified: false,
        electionId,
        roundId,
        step: "ZK_PROOF_VERIFICATION",
        reason: result.reason,
      };
    }

    logger.info("ZK proof verification passed", {
      electionId,
      roundId,
      detail: result.reason,
    });

    return {
      verified: true,
      electionId,
      roundId,
      derivedMerkleRoot,
      submissionCount: submission.submissions.length,
      warnings: [],
    };
  }
}
