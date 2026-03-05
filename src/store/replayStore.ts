/**
 * Replay Prevention Store (Persistent, File-Based)
 *
 * Tracks which (electionId, roundId) pairs have already been processed.
 * Prevents duplicate submissions from being accepted.
 *
 * Design:
 *   - Backed by a JSON file on disk
 *   - Loaded into memory on startup
 *   - Flushed to disk after every write
 *   - Survives process restarts (restart-safe)
 *   - NOT memory-only
 *
 * File format:
 *   {
 *     "processedRounds": {
 *       "<electionId>": [roundId1, roundId2, ...]
 *     }
 *   }
 *
 * IMPORTANT:
 *   - This store is checked BEFORE any blockchain interaction.
 *   - If a round is already processed, it is rejected immediately.
 *   - The store is append-only in normal operation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "../logger/index.js";

interface ReplayStoreData {
  processedRounds: Record<string, number[]>;
}

const DEFAULT_STORE_PATH = "data/processed-rounds.json";

export class ReplayPreventionStore {
  private readonly filePath: string;
  private data: ReplayStoreData;

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_STORE_PATH;
    this.data = this.load();
  }

  /**
   * Check whether a (electionId, roundId) pair has already been processed.
   *
   * @returns true if already processed (should be rejected), false if new.
   */
  isProcessed(electionId: string, roundId: number): boolean {
    const rounds = this.data.processedRounds[electionId];
    if (!rounds) return false;
    return rounds.includes(roundId);
  }

  /**
   * Mark a (electionId, roundId) pair as processed.
   * Immediately persists to disk.
   *
   * @throws Error if the pair is already processed (double-mark protection).
   */
  markProcessed(electionId: string, roundId: number): void {
    if (this.isProcessed(electionId, roundId)) {
      throw new Error(
        `ReplayPreventionStore: (${electionId}, ${roundId}) is already marked as processed`
      );
    }

    if (!this.data.processedRounds[electionId]) {
      this.data.processedRounds[electionId] = [];
    }

    this.data.processedRounds[electionId]!.push(roundId);
    this.flush();

    logger.info("Marked round as processed", { electionId, roundId });
  }

  /**
   * Load the store from disk.
   * If the file does not exist, returns an empty store.
   */
  private load(): ReplayStoreData {
    if (!existsSync(this.filePath)) {
      logger.info("Replay store file not found, starting fresh", {
        path: this.filePath,
      });
      return { processedRounds: {} };
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);

      // Basic shape validation
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("processedRounds" in parsed)
      ) {
        throw new Error("Invalid replay store format");
      }

      logger.info("Replay store loaded from disk", { path: this.filePath });
      return parsed as ReplayStoreData;
    } catch (err) {
      logger.error("Failed to load replay store, starting fresh", {
        path: this.filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return { processedRounds: {} };
    }
  }

  /**
   * Persist the current state to disk.
   * Creates the directory if it does not exist.
   */
  private flush(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      // This is a critical failure -- if we can't persist, replay prevention is broken.
      logger.error("CRITICAL: Failed to persist replay store to disk", {
        path: this.filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(
        `ReplayPreventionStore: failed to write to ${this.filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
