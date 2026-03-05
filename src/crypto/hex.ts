/**
 * Hex utility functions for the Verification Layer.
 *
 * Converts between hex strings (with "0x" prefix) and Uint8Array.
 * All conversions are explicit -- no implicit coercion, no silent truncation.
 */

/**
 * Convert a "0x"-prefixed hex string to a Uint8Array.
 *
 * @param hex - Must start with "0x" and contain an even number of hex characters.
 * @throws Error if the input is malformed.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (!hex.startsWith("0x")) {
    throw new Error(`hexToBytes: input must start with "0x", got: "${hex.slice(0, 10)}..."`);
  }

  const stripped = hex.slice(2);

  if (stripped.length % 2 !== 0) {
    throw new Error(`hexToBytes: hex string must have even length, got ${stripped.length}`);
  }

  if (!/^[0-9a-fA-F]*$/.test(stripped)) {
    throw new Error(`hexToBytes: input contains non-hex characters`);
  }

  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < stripped.length; i += 2) {
    bytes[i / 2] = parseInt(stripped.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a "0x"-prefixed lowercase hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Compare two Uint8Arrays for equality.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compare two hex strings (case-insensitive).
 * Both must be "0x"-prefixed.
 */
export function hexEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
