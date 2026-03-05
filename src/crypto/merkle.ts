/**
 * Merkle Tree Construction & Proof Verification
 *
 * Builds a binary Merkle tree from ordered leaf data and derives the root.
 * Also verifies Merkle inclusion proofs against a given root.
 *
 * Design decisions:
 *   - Hash function: keccak256 (consistent with EVM)
 *   - Leaf hashing: keccak256(encryptedVote || tracker) for each submission
 *   - Internal node hashing: keccak256(left || right)
 *   - Pair ordering: for internal nodes, the two children are concatenated
 *     in the order [left, right] as determined by tree position (NOT sorted).
 *   - Odd leaf handling: if a level has odd count, the last node is promoted
 *     (hashed with itself) to maintain a complete binary tree.
 *   - Proof direction: each proof element specifies whether it goes on the
 *     left or right side of the concatenation.
 *
 * IMPORTANT:
 *   - The tree structure depends on the canonical ordering of submissions.
 *   - Changing the ordering changes the root.
 *   - The leaf hash formula must be stable across versions.
 */

import { keccak256, keccak256Concat } from "./hash.js";
import { hexToBytes, bytesToHex, bytesEqual } from "./hex.js";
import type { SubmissionEntry } from "../types/index.js";

/**
 * Compute the leaf hash for a single submission.
 *
 * leaf = keccak256(encryptedVote_bytes || tracker_bytes)
 *
 * This binds the encrypted vote to its tracker immutably.
 */
export function computeLeafHash(entry: SubmissionEntry): Uint8Array {
  const voteBytes = hexToBytes(entry.encryptedVote);
  const trackerBytes = hexToBytes(entry.tracker);
  return keccak256Concat(voteBytes, trackerBytes);
}

/**
 * Build a Merkle tree from an array of leaf hashes.
 *
 * Returns all levels of the tree, from leaves (level 0) to root (last level).
 * Each level is an array of Uint8Array hashes.
 *
 * The root is tree[tree.length - 1][0].
 *
 * @param leaves - Array of leaf hashes (must not be empty).
 * @returns Array of levels. Level 0 = leaves, last level = [root].
 * @throws Error if leaves is empty.
 */
export function buildMerkleTree(leaves: Uint8Array[]): Uint8Array[][] {
  if (leaves.length === 0) {
    throw new Error("buildMerkleTree: cannot build tree from zero leaves");
  }

  const levels: Uint8Array[][] = [];

  // Level 0: the leaves themselves
  levels.push([...leaves]);

  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;

      if (i + 1 < currentLevel.length) {
        // Normal pair: hash(left || right)
        const right = currentLevel[i + 1]!;
        nextLevel.push(keccak256Concat(left, right));
      } else {
        // Odd node: hash with itself
        nextLevel.push(keccak256Concat(left, left));
      }
    }

    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  return levels;
}

/**
 * Extract the Merkle root from a built tree.
 *
 * @param tree - The tree levels as returned by buildMerkleTree.
 * @returns The root hash as a hex string.
 */
export function getMerkleRoot(tree: Uint8Array[][]): string {
  const topLevel = tree[tree.length - 1];
  if (!topLevel || topLevel.length !== 1) {
    throw new Error("getMerkleRoot: tree is malformed, top level must have exactly one node");
  }
  return bytesToHex(topLevel[0]!);
}

/**
 * Generate a Merkle proof for a leaf at a given index.
 *
 * The proof is an array of { hash, position } where position indicates
 * whether the sibling is on the "left" or "right" side.
 *
 * @param tree - The tree levels as returned by buildMerkleTree.
 * @param leafIndex - The index of the leaf in level 0.
 * @returns Array of proof elements (sibling hashes with position).
 */
export interface MerkleProofElement {
  readonly hash: string;       // bytes32 hex
  readonly position: "left" | "right";
}

export function generateMerkleProof(
  tree: Uint8Array[][],
  leafIndex: number
): MerkleProofElement[] {
  if (leafIndex < 0 || leafIndex >= tree[0]!.length) {
    throw new Error(
      `generateMerkleProof: leafIndex ${leafIndex} out of bounds (0..${tree[0]!.length - 1})`
    );
  }

  const proof: MerkleProofElement[] = [];
  let currentIndex = leafIndex;

  // Walk up the tree, collecting sibling at each level
  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevel = tree[level]!;
    const isLeftNode = currentIndex % 2 === 0;
    const siblingIndex = isLeftNode ? currentIndex + 1 : currentIndex - 1;

    if (siblingIndex < currentLevel.length) {
      proof.push({
        hash: bytesToHex(currentLevel[siblingIndex]!),
        position: isLeftNode ? "right" : "left",
      });
    } else {
      // Odd node at end: sibling is itself
      proof.push({
        hash: bytesToHex(currentLevel[currentIndex]!),
        position: "right",
      });
    }

    // Move to parent index
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verify a Merkle proof against a known root.
 *
 * Takes a leaf hash and the proof (array of bytes32 hex siblings),
 * recomputes the root, and checks if it matches the expected root.
 *
 * The proof format from Mixnet submissions is a flat array of bytes32 hex
 * strings. The position (left/right) is inferred by comparing hashes:
 * at each level, the smaller hash goes on the left.
 *
 * Wait -- that would be a "sorted pair" Merkle tree, which is different
 * from our "positional" tree. Since Mixnet submissions provide a flat
 * proof array, we need to define how position is determined.
 *
 * DECISION: The submitted merkleProof array elements are ordered from
 * leaf to root. At each step, we determine position by checking whether
 * the current node index is even (current is left, proof is right) or
 * odd (proof is left, current is right). The leaf index is derived from
 * the canonical ordering.
 *
 * @param leafHash - The leaf hash (Uint8Array, 32 bytes).
 * @param proofHexes - The Merkle proof as array of bytes32 hex strings.
 * @param leafIndex - The index of the leaf in the canonical ordering.
 * @param expectedRoot - The expected Merkle root (hex string).
 * @returns true if the proof is valid, false otherwise.
 */
export function verifyMerkleProof(
  leafHash: Uint8Array,
  proofHexes: readonly string[],
  leafIndex: number,
  expectedRoot: string
): boolean {
  let currentHash = leafHash;
  let currentIndex = leafIndex;

  for (const proofHex of proofHexes) {
    const siblingHash = hexToBytes(proofHex);
    const isLeftNode = currentIndex % 2 === 0;

    if (isLeftNode) {
      // Current is left, sibling is right
      currentHash = keccak256Concat(currentHash, siblingHash);
    } else {
      // Current is right, sibling is left
      currentHash = keccak256Concat(siblingHash, currentHash);
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  const computedRoot = bytesToHex(currentHash);
  return computedRoot.toLowerCase() === expectedRoot.toLowerCase();
}
