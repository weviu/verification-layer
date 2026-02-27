# Verification Layer – Implementation Instructions (AI Agent)

## Context and Core Principle

You are implementing the **Verification Layer (VL)** of a secure digital voting system.
Project root: `/home/san/verificationLayer/`

This component is **security-critical**.

**Primary rule:**

> ❗ Correctness, clarity, and explicitness are more important than speed, convenience, or minimal code.

No shortcuts, no “temporary hacks”, no implicit trust in inputs.

---

## High-Level Mission (Read First)

The Verification Layer is the **only active verifier** in the system.

It sits between:

```
Mixnet Network → Verification Layer → Blockchain
```

Its job is to:

1. **Receive raw data** from Mixnet nodes
2. **Verify correctness** of that data (structural + cryptographic)
3. **Construct the Merkle tree and Merkle root**
4. **Commit only verified Merkle roots** to the blockchain
5. **Never leak sensitive material** to the blockchain

The blockchain is **not** a verifier.
The verification layer **is**.

---

## Trust Model (Important)

* Mixnet nodes are **not trusted**
* Incoming data is **always untrusted**
* Blockchain is **append-only and passive**
* Verification Layer is **trusted and authoritative**
* Only the Verification Layer is allowed to submit commitments on-chain

If something is unclear or ambiguous → **fail closed**.

---

# PHASE 1 — Interface & Data Ingestion (No Cryptographic Validation)

### Objective

Define *how* raw Mixnet data enters the Verification Layer **without interpreting or verifying it yet**.

### Requirements

1. Expose a **single, explicit input interface** for Mixnet submissions
   (REST API, WebSocket, or equivalent)

2. Define a **strict input schema** for a submission:

   * `electionId` (bytes32 hex)
   * `roundId` (integer)
   * `zkProof` (encoded)
   * `submissions[]`

     * `nodeId`
     * `encryptedVote`
     * `tracker`
     * `merkleProof`
   * `metadata`

     * node signatures
     * version
     * timestamp

   ⚠️ **Important:**
   Mixnet does **NOT** submit a Merkle root.
   Merkle roots are derived **only** by the Verification Layer.

3. Perform **only structural validation**:

   * Required fields present
   * Correct encodings and formats
   * No coercion, no defaults

❌ Do NOT:

* Build Merkle trees
* Verify Merkle proofs
* Verify ZK proofs
* Submit anything to blockchain

📌 Output of Phase 1:
Clean, strictly validated input objects ready for cryptographic verification.

---

# PHASE 2 — Cryptographic & Logical Verification (Core Security Phase)

### Objective

Determine whether a Mixnet round is **cryptographically valid** and internally consistent.

### Required Verifications

1. **Canonical Ordering**

   * Define a deterministic ordering for submissions
     (e.g. by hash(tracker))
   * Ordering rules must be explicit and stable

2. **Merkle Tree Construction**

   * Construct Merkle tree from ordered `(encryptedVote, tracker)` pairs
   * Derive the Merkle root
   * This Merkle root becomes the **canonical fingerprint** of the round

3. **Merkle Proof Verification**

   * Each submission’s Merkle proof must:

     * Be valid
     * Resolve to the derived Merkle root
   * Any failure → reject entire round

4. **Zero-Knowledge Proof Verification**

   * Verify that:

     * No votes were added
     * No votes were removed
     * Shuffle was performed correctly
   * ZK proof failure = hard rejection

5. **Node-Level Checks**

   * Node IDs are unique and expected
   * Optional: verify node signatures
   * Ensure full round participation (as defined by protocol)

6. **Replay Prevention (Off-Chain)**

   * Detect whether `(electionId, roundId)` was already processed
   * Reject duplicates **before** any blockchain interaction

❌ Do NOT:

* “Fix” malformed data
* Accept partial rounds
* Skip verification steps

📌 Output of Phase 2:
A **binary decision**:
✔️ Valid round → proceed
❌ Invalid round → reject and log

---

# PHASE 3 — Blockchain Commitment (Minimal, Deterministic)

### Objective

Persist verified results immutably.

### Rules

1. Submit **only** the following to the blockchain:

   * `electionId`
   * `roundId`
   * `merkleRoot` (constructed by the Verification Layer)

2. Use a **single authorized wallet**

   * Private key stored securely
   * No dynamic key loading
   * No fallback wallets

3. Call only:

```solidity
submitCommitment(electionId, roundId, merkleRoot)
```

4. Wait for transaction confirmation

   * Log tx hash
   * Handle failures explicitly

❌ Never submit:

* Encrypted votes
* Trackers
* Merkle proofs
* ZK proofs
* Metadata

📌 Output of Phase 3:
A confirmed on-chain `CommitmentStored` event.

---

# PHASE 4 — Event Awareness & Downstream Support

### Objective

Enable downstream systems to react correctly and verifiably.

1. Treat `CommitmentStored` as the **single source of truth**

2. Make verified round data available off-chain for:

   * Homomorphic counting
   * Public verification service

3. Persist off-chain:

   * Encrypted votes
   * Trackers
   * Merkle proofs
   * Derived Merkle root
   * Verification results

4. Support **event replay**

   * Restart-safe
   * No reliance on memory-only state

---

## Security Rules (Non-Negotiable)

* No silent failures
* No auto-correction of invalid input
* No skipping verification steps
* No trusting upstream components
* Prefer explicit errors over assumptions

If a requirement is ambiguous → **stop and ask**.

---

## Final Instruction to the Agent

> Implement each phase **fully and correctly** before moving to the next.
> Do not merge phases.
> Do not optimize early.
> Security and correctness are the priority.

---

## Final Notes

* Smart contract:
  `/home/san/ibftnetwork/contracts/commitmentRegistry.sol`
* Blockchain access info:
  `/home/san/ibftnetwork/docs/BlockchainAccess.md`
* Authorized wallet information can be found in:

  * genesis file
  * node configuration folders inside `ibftnetwork`