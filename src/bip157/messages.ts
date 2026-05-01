import { createHash } from 'crypto';
import { BitcoinNetwork } from '../types';
import { encodeVarint } from '../utils/encoding';

const MAGIC: Record<BitcoinNetwork, Buffer> = {
  mainnet: Buffer.from([0xf9, 0xbe, 0xb4, 0xd9]),
  testnet: Buffer.from([0x0b, 0x11, 0x09, 0x07]),
  regtest: Buffer.from([0xfa, 0xbf, 0xb5, 0xda]),
};

function sha256d(data: Buffer): Buffer {
  return createHash('sha256').update(
    createHash('sha256').update(data).digest()
  ).digest();
}

export function buildMessage(network: BitcoinNetwork, command: string, payload: Buffer): Buffer {
  const magic = MAGIC[network];
  const commandBuf = Buffer.alloc(12);
  commandBuf.write(command, 0, 'ascii');

  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(payload.length, 0);

  const checksum = sha256d(payload).subarray(0, 4);
  return Buffer.concat([magic, commandBuf, lenBuf, checksum, payload]);
}

export interface ParsedMessage {
  command: string;
  payload: Buffer;
}

export function parseMessage(buf: Buffer): { msg: ParsedMessage; consumed: number } | null {
  if (buf.length < 24) return null;
  const payloadLen = buf.readUInt32LE(16);
  if (buf.length < 24 + payloadLen) return null;

  const command = buf.subarray(4, 16).toString('ascii').replace(/\0/g, '');
  const payload = buf.subarray(24, 24 + payloadLen);

  const expected = sha256d(payload).subarray(0, 4);
  const actual = buf.subarray(20, 24);
  if (!expected.equals(actual)) return null;

  return { msg: { command, payload }, consumed: 24 + payloadLen };
}

export function buildVersion(network: BitcoinNetwork, startHeight: number): Buffer {
  const parts: Buffer[] = [];

  const version = Buffer.allocUnsafe(4);
  version.writeInt32LE(70016, 0);
  parts.push(version);

  parts.push(Buffer.alloc(8)); // services = 0

  const timestamp = Buffer.allocUnsafe(8);
  timestamp.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 0);
  parts.push(timestamp);

  parts.push(Buffer.alloc(26)); // addr_recv
  parts.push(Buffer.alloc(26)); // addr_from

  parts.push(Buffer.alloc(8)); // nonce

  const userAgent = '/bitcoin-payment-verifier:0.1.0/';
  const uaBytes = Buffer.from(userAgent, 'ascii');
  parts.push(encodeVarint(uaBytes.length));
  parts.push(uaBytes);

  const height = Buffer.allocUnsafe(4);
  height.writeInt32LE(startHeight, 0);
  parts.push(height);

  parts.push(Buffer.from([0x00])); // relay=false

  const payload = Buffer.concat(parts);
  return buildMessage(network, 'version', payload);
}

export function buildVerack(network: BitcoinNetwork): Buffer {
  return buildMessage(network, 'verack', Buffer.alloc(0));
}

export function buildGetcfheaders(
  network: BitcoinNetwork,
  startHeight: number,
  stopHash: Buffer
): Buffer {
  const payload = Buffer.allocUnsafe(1 + 4 + 32);
  payload[0] = 0x00; // filter type: basic
  payload.writeUInt32LE(startHeight, 1);
  stopHash.copy(payload, 5);
  return buildMessage(network, 'getcfheaders', payload);
}

export function buildGetcfilters(
  network: BitcoinNetwork,
  startHeight: number,
  stopHash: Buffer
): Buffer {
  const payload = Buffer.allocUnsafe(1 + 4 + 32);
  payload[0] = 0x00;
  payload.writeUInt32LE(startHeight, 1);
  stopHash.copy(payload, 5);
  return buildMessage(network, 'getcfilters', payload);
}

export function buildGetdata(network: BitcoinNetwork, type: number, hash: Buffer): Buffer {
  const count = encodeVarint(1);
  const item = Buffer.allocUnsafe(4 + 32);
  item.writeUInt32LE(type, 0);
  hash.copy(item, 4);
  return buildMessage(network, 'getdata', Buffer.concat([count, item]));
}

export function buildPong(network: BitcoinNetwork, nonce: Buffer): Buffer {
  return buildMessage(network, 'pong', nonce);
}
