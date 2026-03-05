/**
 * Test script: generates a valid Mixnet submission with correct Merkle proofs
 * and sends it to the Verification Layer.
 *
 * This script:
 *   1. Creates sample submission entries
 *   2. Orders them canonically (same algorithm as the VL)
 *   3. Builds the Merkle tree
 *   4. Generates correct Merkle proofs for each entry
 *   5. Sends the full submission to the VL endpoint
 *
 * Usage:
 *   npx tsx tests/generate-valid-submission.ts
 *
 * Requires the VL server to be running (pnpm run dev).
 */

import { canonicalOrder } from "../src/crypto/ordering.js";
import {
  computeLeafHash,
  buildMerkleTree,
  generateMerkleProof,
  getMerkleRoot,
} from "../src/crypto/merkle.js";
import { bytesToHex } from "../src/crypto/hex.js";
import type { SubmissionEntry } from "../src/types/index.js";

const VL_URL = process.env.VL_URL ?? "http://localhost:3000";

// --- Sample data ---

const electionId = "0x" + "aa".repeat(32);

const rawSubmissions: SubmissionEntry[] = [
  {
    nodeId: "node-alpha",
    encryptedVote: "0xdeadbeef0001",
    tracker: "0x" + "11".repeat(16),
    merkleProof: [], // will be filled in
  },
  {
    nodeId: "node-beta",
    encryptedVote: "0xdeadbeef0002",
    tracker: "0x" + "22".repeat(16),
    merkleProof: [],
  },
  {
    nodeId: "node-gamma",
    encryptedVote: "0xdeadbeef0003",
    tracker: "0x" + "33".repeat(16),
    merkleProof: [],
  },
  {
    nodeId: "node-delta",
    encryptedVote: "0xdeadbeef0004",
    tracker: "0x" + "44".repeat(16),
    merkleProof: [],
  },
];

// --- Build correct proofs ---

// Step 1: Canonical ordering
const ordered = canonicalOrder(rawSubmissions);
console.log("Canonical order:");
ordered.forEach((s, i) => console.log(`  [${i}] ${s.nodeId} tracker=${s.tracker}`));

// Step 2: Build Merkle tree
const leafHashes = ordered.map(computeLeafHash);
const tree = buildMerkleTree(leafHashes);
const merkleRoot = getMerkleRoot(tree);
console.log(`\nDerived Merkle root: ${merkleRoot}`);
console.log(`Tree depth: ${tree.length}`);

// Step 3: Generate proofs for each leaf
const proofsForOrdered = ordered.map((_, index) => generateMerkleProof(tree, index));

// Step 4: Build the submission payload
// Map proofs back to original (unordered) entries
const submissionsWithProofs = rawSubmissions.map((entry) => {
  // Find index of this entry in the canonical order
  const orderedIndex = ordered.findIndex((o) => o.nodeId === entry.nodeId);
  const proof = proofsForOrdered[orderedIndex]!;

  return {
    ...entry,
    merkleProof: proof.map((p) => p.hash),
  };
});

const payload = {
  electionId,
  roundId: 1,
  zkProof: "0x" + "de".repeat(64),
  submissions: submissionsWithProofs,
  metadata: {
    nodeSignatures: rawSubmissions.map((s) => ({
      nodeId: s.nodeId,
      signature: "0x" + "ab".repeat(32),
    })),
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  },
};

// --- Send to VL ---

async function main(): Promise<void> {
  console.log("\n--- Sending valid submission to VL ---\n");

  const response = await fetch(`${VL_URL}/api/v1/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  console.log(`Status: ${response.status}`);
  console.log(`Response: ${JSON.stringify(body, null, 2)}`);

  // --- Test 2: Replay detection (send same submission again) ---
  console.log("\n--- Sending duplicate submission (should be rejected as replay) ---\n");

  const response2 = await fetch(`${VL_URL}/api/v1/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body2 = await response2.json();
  console.log(`Status: ${response2.status}`);
  console.log(`Response: ${JSON.stringify(body2, null, 2)}`);

  // --- Test 3: Bad Merkle proof ---
  console.log("\n--- Sending submission with bad Merkle proof ---\n");

  const badPayload = {
    ...payload,
    roundId: 2, // different round to avoid replay
    submissions: payload.submissions.map((s, i) => {
      if (i === 0) {
        // Corrupt the first node's proof
        return {
          ...s,
          merkleProof: [
            "0x" + "ff".repeat(32), // wrong hash
            ...s.merkleProof.slice(1),
          ],
        };
      }
      return s;
    }),
  };

  const response3 = await fetch(`${VL_URL}/api/v1/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badPayload),
  });

  const body3 = await response3.json();
  console.log(`Status: ${response3.status}`);
  console.log(`Response: ${JSON.stringify(body3, null, 2)}`);

  // --- Test 4: Duplicate node IDs ---
  console.log("\n--- Sending submission with duplicate node IDs ---\n");

  const dupPayload = {
    ...payload,
    roundId: 3,
    submissions: [
      payload.submissions[0],
      { ...payload.submissions[1]!, nodeId: payload.submissions[0]!.nodeId }, // duplicate
    ],
  };

  const response4 = await fetch(`${VL_URL}/api/v1/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dupPayload),
  });

  const body4 = await response4.json();
  console.log(`Status: ${response4.status}`);
  console.log(`Response: ${JSON.stringify(body4, null, 2)}`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
