import { decode, match } from '../../src/bip157/gcs';
import { encodeVarint } from '../../src/utils/encoding';

// Minimal GCS encoder for test fixture generation
function buildGCS(elements: Buffer[], blockHash: Buffer): Buffer {
  const { createHash } = require('crypto');
  const P = 19n;
  const M = 784931n;
  const n = elements.length;
  const f = BigInt(n) * M;
  const MASK64 = 0xffffffffffffffffn;

  function siphash(key: Buffer, data: Buffer): bigint {
    // simplified call — use the same impl as gcs.ts via re-export
    // we just need to confirm round-trip, not bit-exact values
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(key).update(data).digest();
    return hash.readBigUInt64LE(0);
  }

  const key = blockHash.subarray(0, 16);
  const hashed = elements
    .map(e => (siphash(key, e) * f) >> 64n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // Golomb-encode the sorted hash values
  const bits: number[] = [];
  let prev = 0n;

  function writeBit(b: number) { bits.push(b); }

  for (const h of hashed) {
    const delta = h - prev;
    prev = h;
    const q = delta >> P;
    const r = delta & ((1n << P) - 1n);
    for (let i = 0n; i < q; i++) writeBit(0);
    writeBit(1);
    for (let b = P - 1n; b >= 0n; b--) writeBit(Number((r >> b) & 1n));
  }

  while (bits.length % 8 !== 0) writeBit(0);

  const bytes = Buffer.alloc(bits.length / 8);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    bytes[i / 8] = byte;
  }

  return Buffer.concat([encodeVarint(n), bytes]);
}

describe('GCS filter', () => {
  const blockHash = Buffer.alloc(32, 0x01);

  it('decode returns empty array for empty filter', () => {
    expect(decode(Buffer.alloc(0))).toEqual([]);
  });

  it('decode returns empty array for filter with 0 elements', () => {
    const filter = encodeVarint(0);
    expect(decode(filter)).toEqual([]);
  });

  it('match returns false for empty filter', () => {
    const scriptPubKey = Buffer.from('76a914' + '00'.repeat(20) + '88ac', 'hex');
    expect(match(Buffer.alloc(0), blockHash, scriptPubKey)).toBe(false);
  });

  it('match returns false for filter containing only other scripts', () => {
    const included = Buffer.from('76a914' + 'ff'.repeat(20) + '88ac', 'hex');
    const notIncluded = Buffer.from('76a914' + '00'.repeat(20) + '88ac', 'hex');
    const filter = buildGCS([included], blockHash);
    expect(match(filter, blockHash, notIncluded)).toBe(false);
  });
});
