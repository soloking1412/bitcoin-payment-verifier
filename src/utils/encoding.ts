export function encodeVarint(value: number): Buffer {
  if (value < 0xfd) {
    return Buffer.from([value]);
  } else if (value <= 0xffff) {
    const buf = Buffer.allocUnsafe(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(value, 1);
    return buf;
  } else if (value <= 0xffffffff) {
    const buf = Buffer.allocUnsafe(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(value, 1);
    return buf;
  } else {
    const buf = Buffer.allocUnsafe(9);
    buf[0] = 0xff;
    buf.writeBigUInt64LE(BigInt(value), 1);
    return buf;
  }
}

export function decodeVarint(buf: Buffer, offset: number): { value: number; size: number } {
  const first = buf[offset];
  if (first < 0xfd) return { value: first, size: 1 };
  if (first === 0xfd) return { value: buf.readUInt16LE(offset + 1), size: 3 };
  if (first === 0xfe) return { value: buf.readUInt32LE(offset + 1), size: 5 };
  return { value: Number(buf.readBigUInt64LE(offset + 1)), size: 9 };
}

export function sha256d(data: Buffer): Buffer {
  const { createHash } = require('crypto');
  return createHash('sha256').update(
    createHash('sha256').update(data).digest()
  ).digest();
}

export function toLE32(value: number): Buffer {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

export function toLE64(value: bigint): Buffer {
  const buf = Buffer.allocUnsafe(8);
  buf.writeBigUInt64LE(value, 0);
  return buf;
}
