// CRC-16 (CCITT, polynomial 0x1021) and CRC-32 (polynomial 0xedb88320) tables for Zmodem & Trzsz

const CRC16_TABLE = new Uint16Array(256);
const CRC32_TABLE = new Uint32Array(256);

// Initialize tables once
(() => {
  for (let i = 0; i < 256; i++) {
    let c16 = i << 8;
    for (let j = 0; j < 8; j++) {
      c16 = c16 & 0x8000 ? (c16 << 1) ^ 0x1021 : c16 << 1;
    }
    CRC16_TABLE[i] = c16 & 0xffff;

    let c32 = i;
    for (let j = 0; j < 8; j++) {
      c32 = c32 & 1 ? 0xedb88320 ^ (c32 >>> 1) : c32 >>> 1;
    }
    CRC32_TABLE[i] = c32 >>> 0;
  }
})();

export function updateCrc16(crc: number, byte: number): number {
  return ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ byte) & 0xff]) & 0xffff;
}

export function calculateCrc16(bytes: Uint8Array | number[]): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = updateCrc16(crc, bytes[i]);
  }
  return crc;
}

export function updateCrc32(crc: number, byte: number): number {
  return (CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
}

export function calculateCrc32(bytes: Uint8Array | number[]): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = updateCrc32(crc, bytes[i]);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
