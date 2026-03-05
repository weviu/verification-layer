/**
 * Verification Layer - Main Entry Point
 *
 * Exposes a single, explicit REST API endpoint for Mixnet submissions.
 * This is the ONLY entry point for data into the Verification Layer.
 *
 * Phase 1: Structural validation
 *   - Validates input structure against strict schema
 *
 * Phase 2: Cryptographic & logical verification
 *   - Canonical ordering, Merkle tree construction, proof verification
 *   - ZK proof verification (stub: fail-closed or passthrough via VL_ZK_MODE)
 *   - Node-level checks, replay prevention
 */

import express, { type Request, type Response, type NextFunction, type Express } from "express";
import { validateSubmission } from "./validation/structural.js";
import { VerificationPipeline } from "./verification/pipeline.js";
import { createZkVerifier } from "./verification/zkVerifier.js";
import { ReplayPreventionStore } from "./store/replayStore.js";
import { logger } from "./logger/index.js";

// --- Configuration ---

const PORT = parseInt(process.env.VL_PORT ?? "3000", 10);
const HOST = process.env.VL_HOST ?? "0.0.0.0";
const ZK_MODE = process.env.VL_ZK_MODE ?? "strict";
// TODO: Remove VL_ACCEPT_EMPTY_PROOFS once Mixnet produces Merkle proofs
const ACCEPT_EMPTY_PROOFS = process.env.VL_ACCEPT_EMPTY_PROOFS === "true";

if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) {
  logger.error("Invalid port configuration", { port: process.env.VL_PORT });
  process.exit(1);
}

// --- Initialize Phase 2 components ---

const replayStore = new ReplayPreventionStore();
const zkVerifier = createZkVerifier();
const verificationPipeline = new VerificationPipeline(replayStore, zkVerifier, ACCEPT_EMPTY_PROOFS);

logger.info("Phase 2 components initialized", {
  zkMode: ZK_MODE,
  acceptEmptyProofs: ACCEPT_EMPTY_PROOFS,
});

// --- Express App ---

const app: Express = express();

// Parse JSON bodies with a reasonable size limit.
// Reject anything that isn't application/json.
app.use(
  express.json({
    limit: "5mb",
    type: "application/json",
  })
);

// Reject requests with malformed JSON (Express will emit a SyntaxError)
app.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof SyntaxError && "body" in err) {
    logger.warn("Malformed JSON in request body");
    res.status(400).json({
      success: false,
      error: "MALFORMED_JSON",
      message: "Request body contains invalid JSON",
    });
    return;
  }
  next(err);
});

// --- Health check ---

app.get("/health", (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    phase: 2,
    zkMode: ZK_MODE,
    acceptEmptyProofs: ACCEPT_EMPTY_PROOFS,
  });
});

// --- Submission endpoint ---

/**
 * POST /api/v1/submissions
 *
 * Accepts a Mixnet round submission, performs:
 *   Phase 1: Structural validation
 *   Phase 2: Cryptographic & logical verification
 *
 * Returns:
 *   - 200 with derived Merkle root on full verification success
 *   - 400 on structural validation failure
 *   - 422 on cryptographic verification failure
 *   - 409 on replay (duplicate round)
 *
 * Content-Type must be application/json.
 */
app.post("/api/v1/submissions", async (req: Request, res: Response): Promise<void> => {
  logger.info("Received submission request", {
    contentType: req.headers["content-type"],
    ip: req.ip,
  });

  // Explicit content-type check
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("application/json")) {
    logger.warn("Rejected request: invalid content-type", { contentType });
    res.status(415).json({
      success: false,
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "Content-Type must be application/json",
    });
    return;
  }

  const body: unknown = req.body;

  // --- Phase 1: Structural validation ---
  const structuralResult = validateSubmission(body);

  if (!structuralResult.valid) {
    logger.warn("Submission rejected (structural validation failed)", {
      errorCount: structuralResult.errors.length,
    });

    res.status(400).json({
      success: false,
      error: "STRUCTURAL_VALIDATION_FAILED",
      message: "Submission failed structural validation. See errors for details.",
      errors: structuralResult.errors,
    });
    return;
  }

  logger.info("Phase 1 passed, proceeding to Phase 2", {
    electionId: structuralResult.data.electionId,
    roundId: structuralResult.data.roundId,
  });

  // --- Phase 2: Cryptographic & logical verification ---
  try {
    const verificationResult = await verificationPipeline.verify(structuralResult.data);

    if (verificationResult.verified) {
      const hasWarnings = verificationResult.warnings.length > 0;
      const responseBody: Record<string, unknown> = {
        success: true,
        message: hasWarnings
          ? "Round verified successfully (Merkle proofs bypassed in development mode)."
          : "Round verified successfully. Ready for blockchain commitment.",
        data: {
          electionId: verificationResult.electionId,
          roundId: verificationResult.roundId,
          derivedMerkleRoot: verificationResult.derivedMerkleRoot,
          submissionCount: verificationResult.submissionCount,
        },
      };

      if (hasWarnings) {
        responseBody.warnings = verificationResult.warnings;
      }

      res.status(200).json(responseBody);
      return;
    }

    // Verification failed: determine appropriate HTTP status
    const httpStatus = verificationResult.step === "REPLAY_PREVENTION" ? 409 : 422;

    res.status(httpStatus).json({
      success: false,
      error: "VERIFICATION_FAILED",
      step: verificationResult.step,
      message: verificationResult.reason,
    });
  } catch (err) {
    logger.error("Unexpected error during verification pipeline", {
      error: err instanceof Error ? err.message : String(err),
      electionId: structuralResult.data.electionId,
      roundId: structuralResult.data.roundId,
    });

    res.status(500).json({
      success: false,
      error: "VERIFICATION_INTERNAL_ERROR",
      message: "An unexpected error occurred during verification",
    });
  }
});

// --- Catch-all for unknown routes ---

app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: "Unknown endpoint",
  });
});

// --- Global error handler ---

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error("Unhandled server error", {
    error: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
});

// --- Start server ---

app.listen(PORT, HOST, () => {
  logger.info(`Verification Layer started`, {
    host: HOST,
    port: PORT,
    phase: 2,
    zkMode: ZK_MODE,
  });
  logger.info("Endpoints available:", {
    health: "GET /health",
    submit: "POST /api/v1/submissions",
  });
});

export { app };
