# Temporary Development Mode – Merkle Proof Bypass (Until Mixnet Ready)

## Context

The Mixnet implementation is not yet generating `merkleProof` arrays.

However, Phase 2 of the Verification Layer expects proofs for each submission.
To allow integration testing before Mixnet is finished, the Verification Layer must temporarily support **proof-less submissions**.

This change must be **explicitly documented and isolated**, so that it can be safely removed later.

---

# Required Implementation

## 1. Add a configuration flag

Introduce an environment variable:

```
VL_ACCEPT_EMPTY_PROOFS=true
```

Default behavior must remain **secure**:

```
VL_ACCEPT_EMPTY_PROOFS=false
```

Meaning:

| Mode              | Behavior                                         |
| ----------------- | ------------------------------------------------ |
| `false` (default) | All submissions must contain valid Merkle proofs |
| `true`            | Empty proofs (`[]`) are temporarily accepted     |

---

# 2. Modify Merkle Proof Verification Step

Current behavior:

```
if proof invalid → reject round
```

New logic:

```
if proof.length === 0 AND VL_ACCEPT_EMPTY_PROOFS === true:
    skip proof verification
else:
    perform full proof verification
```

Important rules:

* This bypass must **ONLY apply to empty proofs**
* Non-empty proofs must still be verified normally
* If proof is present but invalid → **reject**

---

# 3. Logging (Required)

Whenever the bypass is used, log clearly:

Example log:

```
WARN  Merkle proof verification bypassed (development mode)
context:
  electionId: ...
  roundId: ...
  nodeId: ...
```

This ensures the system never silently runs in a weakened mode.

---

# 4. API Response Annotation

When proofs are bypassed, include a **warning field** in the response:

Example:

```json
{
  "success": true,
  "message": "Round verified successfully (Merkle proofs bypassed in development mode).",
  "data": {
    "electionId": "...",
    "roundId": 1,
    "derivedMerkleRoot": "...",
    "submissionCount": 4
  },
  "warnings": [
    "Merkle proof verification bypassed because VL_ACCEPT_EMPTY_PROOFS=true"
  ]
}
```

---

# 5. Documentation Requirement

Update project documentation to clearly state:

```
Temporary Development Mode:
Merkle proof verification can be bypassed when
VL_ACCEPT_EMPTY_PROOFS=true.

This mode exists only to allow integration testing
before the Mixnet generates proofs.

This mode MUST be disabled in production.
```

Also add a **TODO marker** in the code:

```
TODO: Remove VL_ACCEPT_EMPTY_PROOFS once Mixnet produces Merkle proofs
```

---

# 6. Security Rule

Even when bypassing proofs:

The following steps must **still run normally**:

* replay prevention
* node-level validation
* canonical ordering
* Merkle tree construction
* Merkle root derivation
* ZK proof verification mode

Only **proof verification** is temporarily skipped.

---

# How You Will Run Dev Mode

Start server like this:

```
VL_ZK_MODE=passthrough VL_ACCEPT_EMPTY_PROOFS=true pnpm run dev
```

This gives you a **fully testable system** while Mixnet is unfinished.

---

## Why this approach is good

It keeps the system:

* secure by default
* explicit about the bypass
* easy to remove later
* compatible with the future Mixnet design
