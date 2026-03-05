# Phase 2 -- Cryptographic & Logical Verification

## Objective

Determine whether a Mixnet round submission is cryptographically valid
and internally consistent. Produce a binary decision: valid or rejected.

---

## Changes to Phase 1

**`merkleRoot` removed from input schema.**
The updated instructions clarify that Mixnet nodes do NOT submit a Merkle root.
The Verification Layer constructs the Merkle tree itself and derives the canonical root.
The `merkleRoot` field was removed from `MixnetSubmissionSchema`.

**`merkleProof` minimum relaxed.**
A single-leaf tree requires zero proof elements, so `merkleProof` now accepts
an empty array (was previously min 1).

---

## New Files

```
src/
  crypto/
    hex.ts              -- Hex/bytes conversion utilities
    hash.ts             -- keccak256 hashing (via @noble/hashes)
    ordering.ts         -- Canonical ordering of submissions
    merkle.ts           -- Merkle tree construction, proof generation, proof verification
  verification/
    zkVerifier.ts       -- ZK proof verifier interface + fail-closed stub
    nodeChecks.ts       -- Node-level validation (uniqueness, signature matching)
    pipeline.ts         -- Main verification pipeline (orchestrates all steps)
  store/
    replayStore.ts      -- Persistent file-based replay prevention
tests/
  generate-valid-submission.ts  -- Test script that generates and sends valid/invalid submissions
```

### Dependency added

- `@noble/hashes` -- Pure JS, audited cryptographic hash library. Used for keccak256.

---

## Verification Pipeline

The pipeline runs 6 steps in order. Each step must pass before the next runs.
If any step fails, the entire round is rejected and no further steps execute.

### Step 1: Replay Prevention

- Checks if `(electionId, roundId)` was already processed
- Backed by a JSON file on disk (`data/processed-rounds.json`)
- Survives restarts (not memory-only)
- Rejects duplicates with HTTP 409

### Step 2: Node-Level Checks

- All `nodeId` values in `submissions[]` must be unique
- All `nodeId` values in `metadata.nodeSignatures[]` must be unique
- Every submission node must have a corresponding metadata signature

### Step 3: Canonical Ordering

- Submissions are sorted by `keccak256(tracker)` in ascending lexicographic order
- This is deterministic: same inputs always produce the same order
- The ordering determines each submission's position (leaf index) in the Merkle tree
- This rule must remain stable across versions

### Step 4: Merkle Tree Construction

- Each leaf is computed as `keccak256(encryptedVote || tracker)`
- A binary Merkle tree is built from the ordered leaves
- Internal nodes are `keccak256(left || right)`
- If a level has an odd number of nodes, the last node is hashed with itself
- The root of this tree becomes the **canonical Merkle root** for the round

### Step 5: Merkle Proof Verification

- Each submission includes a `merkleProof` array (claimed proof from Mixnet)
- The VL verifies each proof against its own derived Merkle root
- The leaf index comes from the canonical ordering (Step 3)
- Proof elements are applied positionally (even index = current is left, odd = current is right)
- Any single proof failure rejects the entire round

### Step 6: ZK Proof Verification

- Controlled via the `VL_ZK_MODE` environment variable:
  - `"strict"` (default): Rejects all proofs unconditionally (fail-closed stub)
  - `"passthrough"`: Accepts all proofs (development/testing only)
- When a real ZK circuit is available, implement the `ZkVerifier` interface
- The interface receives the full submission plus the derived Merkle root

---

## API Changes

### `POST /api/v1/submissions`

The endpoint now runs both Phase 1 (structural) and Phase 2 (cryptographic) validation.

**On full verification success (200):**
```json
{
  "success": true,
  "message": "Round verified successfully. Ready for blockchain commitment.",
  "data": {
    "electionId": "0x...",
    "roundId": 1,
    "derivedMerkleRoot": "0x4173a113...",
    "submissionCount": 4
  }
}
```

**On structural validation failure (400):**
Same as Phase 1 -- array of field-level errors.

**On replay / duplicate round (409):**
```json
{
  "success": false,
  "error": "VERIFICATION_FAILED",
  "step": "REPLAY_PREVENTION",
  "message": "Round (...) has already been processed. Duplicate submission rejected."
}
```

**On cryptographic verification failure (422):**
```json
{
  "success": false,
  "error": "VERIFICATION_FAILED",
  "step": "MERKLE_PROOF_VERIFICATION",
  "message": "Node node-alpha: Merkle proof does not resolve to the derived root."
}
```

### `GET /health`

Now returns `"phase": 2` and includes the active `zkMode`.

---

## Hash Function

keccak256 is used throughout, consistent with the EVM. All hashing uses
`@noble/hashes/sha3.js` (`keccak_256`).

- Leaf hash: `keccak256(encryptedVote_bytes || tracker_bytes)`
- Internal node: `keccak256(left_child || right_child)`
- Sort key: `keccak256(tracker_bytes)` converted to hex for string comparison

---

## Replay Store

File: `data/processed-rounds.json`

Format:
```json
{
  "processedRounds": {
    "0xaaa...": [1, 2, 3]
  }
}
```

- Loaded into memory on startup
- Written to disk after every new entry
- If the file is missing, the store starts empty
- If the file is corrupt, the store starts empty (logged as error)

---

## ZK Verifier Interface

```typescript
interface ZkVerifier {
  verify(
    submission: MixnetSubmission,
    derivedMerkleRoot: string
  ): Promise<ZkVerificationResult>;
}

interface ZkVerificationResult {
  valid: boolean;
  reason: string;
}
```

Two implementations exist:

| Implementation           | Behavior         | Use case           |
|--------------------------|------------------|--------------------|
| `FailClosedZkVerifier`   | Rejects all      | Default / production until real verifier exists |
| `PassthroughZkVerifier`  | Accepts all      | Development and testing only                    |

Set `VL_ZK_MODE=passthrough` to use the passthrough verifier.
Any other value (or unset) defaults to strict/fail-closed.

---

## Test Results

All tests pass with `VL_ZK_MODE=passthrough`:

| Test | Expected | Result |
|------|----------|--------|
| Valid 4-node submission with correct proofs | 200 + derived Merkle root | PASS |
| Duplicate submission (replay) | 409 REPLAY_PREVENTION | PASS |
| Corrupted Merkle proof | 422 MERKLE_PROOF_VERIFICATION | PASS |
| Duplicate node IDs | 422 NODE_CHECKS | PASS |
| Strict ZK mode (separate test) | 422 ZK_PROOF_VERIFICATION | PASS |

---

## Temporary Development Mode: Empty Proof Bypass

**Status: ACTIVE -- must be removed once Mixnet generates Merkle proofs.**

The Mixnet implementation does not yet produce `merkleProof` arrays.
To allow integration testing before it does, the VL supports a temporary bypass
controlled by the `VL_ACCEPT_EMPTY_PROOFS` environment variable.

### Configuration

| `VL_ACCEPT_EMPTY_PROOFS` | Behavior |
|--------------------------|----------|
| `false` (default)        | All submissions must contain valid Merkle proofs |
| `true`                   | Empty proofs (`[]`) are temporarily accepted with warnings |

### Rules

- Only applies to **empty** proof arrays (`[]`). Non-empty invalid proofs are still rejected.
- All other verification steps run normally (replay prevention, node checks, canonical ordering, Merkle tree construction, Merkle root derivation, ZK proof verification).
- Every bypassed proof generates a `WARN`-level log entry with `electionId`, `roundId`, and `nodeId`.
- The API response includes a `warnings` array when proofs are bypassed.

### API Response with Bypass

```json
{
  "success": true,
  "message": "Round verified successfully (Merkle proofs bypassed in development mode).",
  "data": {
    "electionId": "0x...",
    "roundId": 1,
    "derivedMerkleRoot": "0x...",
    "submissionCount": 4
  },
  "warnings": [
    "Merkle proof verification bypassed for 4 submission(s) because VL_ACCEPT_EMPTY_PROOFS=true"
  ]
}
```

### Health Endpoint

`GET /health` now includes `acceptEmptyProofs` status:

```json
{"status":"ok","phase":2,"zkMode":"passthrough","acceptEmptyProofs":true}
```

### Test Results (with bypass enabled)

| Test | Expected | Result |
|------|----------|--------|
| Empty proofs, 4-node round | 200 + warnings array | PASS |
| Non-empty invalid proofs | 422 MERKLE_PROOF_VERIFICATION | PASS |
| Replay detection (roundId reuse) | 409 REPLAY_PREVENTION | PASS |
| Duplicate node IDs | 422 NODE_CHECKS | PASS |

### Production Warning

**This mode MUST be disabled in production.**
Set `VL_ACCEPT_EMPTY_PROOFS=false` (or leave unset) for any production deployment.
All TODO markers in the code reference this flag for future removal.

---

## What Phase 2 Does NOT Do

- Does not submit anything to the blockchain (that is Phase 3)
- Does not store verified round data off-chain (that is Phase 4)
- Does not depend on blockchain state for validation
- Does not modify or "fix" any input data

---

## Commands

```bash
# Development (ZK passthrough + empty proofs bypass)
VL_ZK_MODE=passthrough VL_ACCEPT_EMPTY_PROOFS=true pnpm run dev

# Development (ZK passthrough, proofs required)
VL_ZK_MODE=passthrough pnpm run dev

# Production-like (ZK fail-closed, proofs required)
pnpm run dev

# Run test suite
VL_ZK_MODE=passthrough pnpm run dev &
npx tsx tests/generate-valid-submission.ts

# Type check
pnpm run typecheck
```
