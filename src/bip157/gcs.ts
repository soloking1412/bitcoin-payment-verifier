import { createHash } from 'crypto';

const P = 19;
const M = 784931n;

function siphash(key: Buffer, data: Buffer): bigint {
  // SipHash-2-4 implementation for BIP-158 GCS matching
  let v0 = 0x736f6d6570736575n;
  let v1 = 0x646f72616e646f6dn;
  let v2 = 0x6c7967656e657261n;
  let v3 = 0x7465646279746573n;

  const k0 = key.readBigUInt64LE(0);
  const k1 = key.readBigUInt64LE(8);

  v0 ^= k0;
  v1 ^= k1;
  v2 ^= k0;
  v3 ^= k1;

  const MASK = 0xffffffffffffffffn;

  function rotl(x: bigint, b: bigint): bigint {
    return ((x << b) | (x >> (64n - b))) & MASK;
  }

  function sipRound(): void {
    v0 = (v0 + v1) & MASK; v1 = rotl(v1, 13n); v1 ^= v0; v0 = rotl(v0, 32n);
    v2 = (v2 + v3) & MASK; v3 = rotl(v3, 16n); v3 ^= v2;
    v0 = (v0 + v3) & MASK; v3 = rotl(v3, 21n); v3 ^= v0;
    v2 = (v2 + v1) & MASK; v1 = rotl(v1, 17n); v1 ^= v2; v2 = rotl(v2, 32n);
  }

  const blocks = Math.floor(data.length / 8);
  for (let i = 0; i < blocks; i++) {
    const m = data.readBigUInt64LE(i * 8);
    v3 ^= m;
    sipRound();
    sipRound();
    v0 ^= m;
  }

  const remaining = data.length % 8;
  let last = BigInt(data.length & 0xff) << 56n;
  for (let i = 0; i < remaining; i++) {
    last |= BigInt(data[blocks * 8 + i]) << BigInt(i * 8);
  }

  v3 ^= last;
  sipRound();
  sipRound();
  v0 ^= last;

  v2 ^= 0xffn;
  sipRound();
  sipRound();
  sipRound();
  sipRound();

  return (v0 ^ v1 ^ v2 ^ v3) & MASK;
}

function hashToRange(key: Buffer, data: Buffer, f: bigint): bigint {
  const h = siphash(key, data);
  return (h * f) >> 64n;
}

export function decode(filterBytes: Buffer): bigint[] {
  if (filterBytes.length === 0) return [];

  const { decodeVarint } = require('../utils/encoding');
  const { value: n, size } = decodeVarint(filterBytes, 0);
  if (n === 0) return [];

  const bits = filterBytes.subarray(size);
  const result: bigint[] = [];
  let bitPos = 0;
  let last = 0n;

  function readBit(): number {
    const byteIdx = Math.floor(bitPos / 8);
    const bitIdx = 7 - (bitPos % 8);
    bitPos++;
    return (bits[byteIdx] >> bitIdx) & 1;
  }

  for (let i = 0; i < n; i++) {
    let q = 0n;
    while (readBit() === 0) q++;

    let r = 0n;
    for (let b = P - 1; b >= 0; b--) {
      r |= BigInt(readBit()) << BigInt(b);
    }

    const delta = q * (1n << BigInt(P)) + r;
    last += delta;
    result.push(last);
  }

  return result;
}

export function match(filterBytes: Buffer, blockHash: Buffer, scriptPubKey: Buffer): boolean {
  if (filterBytes.length === 0) return false;

  const key = blockHash.subarray(0, 16);
  const { decodeVarint } = require('../utils/encoding');
  const { value: n } = decodeVarint(filterBytes, 0);
  if (n === 0) return false;

  const f = BigInt(n) * M;
  const target = hashToRange(key, scriptPubKey, f);

  const elements = decode(filterBytes);
  let lo = 0;
  let hi = elements.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (elements[mid] === target) return true;
    if (elements[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}
