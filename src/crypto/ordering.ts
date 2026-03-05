/**
 * Canonical Ordering for Mixnet Submissions
 *
 * Defines a DETERMINISTIC ordering for submissions within a round.
 * The same set of submissions must always produce the same order,
 * regardless of the order in which they were received.
 *
 * Ordering rule:
 *   Sort by keccak256(tracker) in ascending lexicographic order (byte-by-byte).
 *
 * This ordering is:
 *   - Deterministic: same inputs = same output
 *   - Collision-resistant: keccak256 ensures distinct trackers produce distinct sort keys
 *   - Stable: if two trackers hash to the same value (astronomically unlikely), original order is preserved
 *
 * IMPORTANT: This ordering is used to construct the Merkle tree.
 * Changing the ordering rule changes the Merkle root.
 * This rule must remain stable across versions.
 */

import type { SubmissionEntry } from "../types/index.js";
import { keccak256 } from "../crypto/hash.js";
import { hexToBytes, bytesToHex } from "../crypto/hex.js";

/**
 * Sort key: the keccak256 hash of the tracker, as a lowercase hex string.
 * Precomputed to avoid redundant hashing during sort comparisons.
 */
interface SubmissionWithSortKey {
  readonly entry: SubmissionEntry;
  readonly sortKey: string;
}

/**
 * Return submissions in canonical order.
 *
 * Does NOT mutate the input array. Returns a new sorted array.
 *
 * @param submissions - The submissions to sort (must not be empty).
 * @returns A new array of submissions in canonical order.
 */
export function canonicalOrder(submissions: readonly SubmissionEntry[]): SubmissionEntry[] {
  // Precompute sort keys
  const withKeys: SubmissionWithSortKey[] = submissions.map((entry) => {
    const trackerBytes = hexToBytes(entry.tracker);
    const hashBytes = keccak256(trackerBytes);
    const sortKey = bytesToHex(hashBytes);
    return { entry, sortKey };
  });

  // Sort by sort key (lexicographic, ascending)
  withKeys.sort((a, b) => {
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });

  return withKeys.map((item) => item.entry);
}
