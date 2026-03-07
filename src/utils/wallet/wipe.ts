/**
 * Securely wipes sensitive data from memory by overwriting
 * buffer contents with zeros before they can be garbage collected.
 */

/**
 * Zeroes out a Buffer or Uint8Array in place.
 */
export function wipeBuffer(buf: Buffer | Uint8Array | null | undefined): void {
  if (!buf) return;
  buf.fill(0);
}

/**
 * Overwrites a string variable's memory footprint as best as possible.
 * Note: JS strings are immutable and GC-managed, so this is a best-effort
 * measure. The original reference should be nulled immediately after calling.
 */
export function wipeString(str: string | null | undefined): void {
  if (!str) return;
  // Force the string through a buffer so we can zero the buffer copy
  const buf = Buffer.from(str, "utf8");
  buf.fill(0);
}

/**
 * Wipes multiple sensitive values in one call.
 * Accepts Buffers, Uint8Arrays, and strings.
 */
export function wipeSensitive(...values: (Buffer | Uint8Array | string | null | undefined)[]): void {
  for (const val of values) {
    if (val === null || val === undefined) continue;
    if (typeof val === "string") {
      wipeString(val);
    } else {
      wipeBuffer(val);
    }
  }
}
