/**
 * Verification Layer - Main Entry Point
 *
 * Exposes a single, explicit REST API endpoint for Mixnet submissions.
 * This is the ONLY entry point for data into the Verification Layer.
 *
 * Phase 1: Structural validation only.
 *   - Accepts POST /api/v1/submissions
 *   - Validates input structure against strict schema
 *   - Returns validated input objects (or explicit errors)
 *   - Does NOT verify Merkle roots, ZK proofs, or submit to blockchain
 */

import express, { type Request, type Response, type NextFunction, type Express } from "express";
import { validateSubmission } from "./validation/structural.js";
import { logger } from "./logger/index.js";

// --- Configuration ---

const PORT = parseInt(process.env.VL_PORT ?? "3000", 10);
const HOST = process.env.VL_HOST ?? "0.0.0.0";

if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) {
  logger.error("Invalid port configuration", { port: process.env.VL_PORT });
  process.exit(1);
}

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
  res.status(200).json({ status: "ok", phase: 1 });
});

// --- Submission endpoint ---

/**
 * POST /api/v1/submissions
 *
 * Accepts a Mixnet round submission, performs structural validation,
 * and returns either:
 *   - 200 with the validated data (ready for Phase 2 verification)
 *   - 400 with detailed validation errors
 *
 * Content-Type must be application/json.
 */
app.post("/api/v1/submissions", (req: Request, res: Response): void => {
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

  const result = validateSubmission(body);

  if (result.valid) {
    logger.info("Submission accepted (structural validation passed)", {
      electionId: result.data.electionId,
      roundId: result.data.roundId,
    });

    res.status(200).json({
      success: true,
      message: "Structural validation passed. Ready for cryptographic verification.",
      data: {
        electionId: result.data.electionId,
        roundId: result.data.roundId,
        merkleRoot: result.data.merkleRoot,
        submissionCount: result.data.submissions.length,
      },
    });
    return;
  }

  // Validation failed: return all errors explicitly
  logger.warn("Submission rejected (structural validation failed)", {
    errorCount: result.errors.length,
  });

  res.status(400).json({
    success: false,
    error: "STRUCTURAL_VALIDATION_FAILED",
    message: "Submission failed structural validation. See errors for details.",
    errors: result.errors,
  });
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
    phase: 1,
  });
  logger.info("Endpoints available:", {
    health: "GET /health",
    submit: "POST /api/v1/submissions",
  });
});

export { app };
