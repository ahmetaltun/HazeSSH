/**
 * Smart file text reader with BOM (Byte Order Mark) and character encoding auto-detection.
 *
 * Essential for importing Windows Registry exports (.reg) which are UTF-16 LE by default,
 * as well as UTF-8 files with or without BOM markers.
 */
export async function readFileAsTextSmart(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length === 0) {
      return "";
    }

    let decoded = "";

    // 1. Detect UTF-16 Little Endian BOM (0xFF, 0xFE) - Standard Windows Registry (.reg) export
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      decoded = new TextDecoder("utf-16le").decode(buffer);
    }
    // 2. Detect UTF-16 Big Endian BOM (0xFE, 0xFF)
    else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      decoded = new TextDecoder("utf-16be").decode(buffer);
    }
    // 3. Detect UTF-8 BOM (0xEF, 0xBB, 0xBF)
    else if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      decoded = new TextDecoder("utf-8").decode(buffer);
    }
    // 4. Heuristic: Check for alternating null bytes indicative of UTF-16LE without BOM
    else {
      let nullCount = 0;
      const sampleSize = Math.min(bytes.length, 256);
      for (let i = 0; i < sampleSize; i++) {
        if (bytes[i] === 0) {
          nullCount++;
        }
      }

      // In ASCII/UTF-8 text, null bytes (0x00) are rare. In UTF-16LE ASCII text, ~50% of bytes are 0x00.
      if (nullCount > sampleSize * 0.2) {
        decoded = new TextDecoder("utf-16le").decode(buffer);
      } else {
        decoded = new TextDecoder("utf-8").decode(buffer);
      }
    }

    // Strip leading Zero Width No-Break Space (U+FEFF / BOM) if present
    if (decoded.charCodeAt(0) === 0xfeff) {
      decoded = decoded.slice(1);
    }

    return decoded;
  } catch (err: unknown) {
    const errorDetails = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read and decode file '${file.name}': ${errorDetails}`
    );
  }
}
