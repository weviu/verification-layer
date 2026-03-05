/**
 * Hashing utilities for the Verification Layer.
 *
 * Uses keccak256 (the EVM-native hash function) throughout
 * for consistency with the on-chain commitment contract.
 *
 * All inputs and outputs are explicit Uint8Array or hex strings.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "./hex.js";

/**
 * Compute keccak256 of a single Uint8Array.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

/**
 * Compute keccak256 of the concatenation of two Uint8Arrays.
 * Used for Merkle tree internal node hashing.
 *
 * hash(left || right)
 */
export function keccak256Concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return keccak_256(combined);
}

/**
 * Compute keccak256 of a hex string, returning a hex string.
 */
export function keccak256Hex(hexStr: string): string {
  return bytesToHex(keccak256(hexToBytes(hexStr)));
}
