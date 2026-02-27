# Phase 1 -- Interface & Data Ingestion

## Objective

Define how data enters the Verification Layer without processing it.
Structural validation only. No cryptographic verification, no blockchain interaction.

---

## Project Setup

- **Runtime:** Node.js with TypeScript (strict mode)
- **Package manager:** pnpm
- **Framework:** Express 5
- **Validation:** Zod 4 (strict schema parsing, no coercion)
- **Module system:** ESM (`"type": "module"` in package.json)

### Dependencies

| Package          | Purpose                        |
|------------------|--------------------------------|
| express          | HTTP server                    |
| zod              | Input schema validation        |
| typescript       | Type checking                  |
| tsx              | Dev server (TypeScript runner) |

---

## File Structure

```
src/
  index.ts                  -- Express server, endpoints, startup
  schema/submission.ts      -- Zod schemas defining the strict input format
  validation/structural.ts  -- Validates unknown input against the schema
  types/index.ts            -- TypeScript types inferred from Zod schemas
  errors/index.ts           -- Custom error classes
  logger/index.ts           -- Structured JSON logger
```

---

## Input Schema

The single ingestion endpoint accepts a JSON payload with this structure:

```
{
  electionId:    bytes32 hex  ("0x" + 64 hex chars)
  roundId:       integer >= 1
  merkleRoot:    bytes32 hex
  zkProof:       hex string   ("0x" prefix, variable length)
  submissions: [
    {
      nodeId:         non-empty string
      encryptedVote:  hex string
      tracker:        hex string
      merkleProof:    array of bytes32 hex strings (min 1)
    }
  ]
  metadata: {
    nodeSignatures: [
      {
        nodeId:     non-empty string
        signature:  hex string
      }
    ]
    version:    non-empty string
    timestamp:  ISO 8601 date string
  }
}
```

All fields are required. No defaults, no coercion, no optional fields.

---

## API Endpoints

### `GET /health`

Returns `{ "status": "ok", "phase": 1 }`.

### `POST /api/v1/submissions`

The single ingestion endpoint for Mixnet round submissions.

**Requires:** `Content-Type: application/json`

**On success (200):**
```json
{
  "success": true,
  "message": "Structural validation passed. Ready for cryptographic verification.",
  "data": {
    "electionId": "0x...",
    "roundId": 1,
    "merkleRoot": "0x...",
    "submissionCount": 1
  }
}
```

**On validation failure (400):**
```json
{
  "success": false,
  "error": "STRUCTURAL_VALIDATION_FAILED",
  "message": "Submission failed structural validation. See errors for details.",
  "errors": [
    {
      "field": "electionId",
      "message": "Must be a bytes32 hex string: '0x' followed by exactly 64 hex characters",
      "code": "invalid_format"
    }
  ]
}
```

**On wrong content type (415):**
```json
{
  "success": false,
  "error": "UNSUPPORTED_MEDIA_TYPE",
  "message": "Content-Type must be application/json"
}
```

**On unknown route (404):**
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Unknown endpoint"
}
```

---

## Validation Rules Enforced

| Field                              | Rule                                         |
|------------------------------------|----------------------------------------------|
| electionId                         | bytes32 hex: `0x` + exactly 64 hex chars     |
| roundId                            | Integer >= 1                                 |
| merkleRoot                         | bytes32 hex                                  |
| zkProof                            | Hex string with `0x` prefix, non-empty       |
| submissions                        | Non-empty array                              |
| submissions[].nodeId               | Non-empty string                             |
| submissions[].encryptedVote        | Hex string with `0x` prefix                  |
| submissions[].tracker              | Hex string with `0x` prefix                  |
| submissions[].merkleProof          | Non-empty array of bytes32 hex strings       |
| metadata.nodeSignatures            | Non-empty array                              |
| metadata.nodeSignatures[].nodeId   | Non-empty string                             |
| metadata.nodeSignatures[].signature| Hex string with `0x` prefix                  |
| metadata.version                   | Non-empty string                             |
| metadata.timestamp                 | Valid ISO 8601 date string                    |

---

## What Phase 1 Does NOT Do

- Does not verify Merkle roots or Merkle proofs
- Does not verify ZK proofs
- Does not check for replays or duplicates
- Does not submit anything to the blockchain
- Does not modify or "fix" invalid input

---

## Commands

```bash
pnpm run dev        # Start dev server (tsx, auto-loads TypeScript)
pnpm run build      # Compile TypeScript to dist/
pnpm run start      # Run compiled output
pnpm run typecheck  # Type check without emitting
```

Server listens on `0.0.0.0:3000` by default.
Configurable via `VL_PORT` and `VL_HOST` environment variables.
