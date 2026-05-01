import * as net from 'net';
import { EventEmitter } from 'events';
import { BitcoinNetwork, PeerAddress } from '../types';
import { buildVersion, buildVerack, buildPong, parseMessage } from './messages';
import { decodeVarint } from '../utils/encoding';

type P2PState = 'idle' | 'version_sent' | 'verack_sent' | 'ready';

export interface CfheadersMessage {
  filterType: number;
  stopHash: Buffer;
  previousFilterHeader: Buffer;
  filterHashes: Buffer[];
}

export interface CfilterMessage {
  filterType: number;
  blockHash: Buffer;
  filterData: Buffer;
}

export interface HeadersMessage {
  headers: Array<{ raw: Buffer; hash: Buffer; height?: number }>;
}

export class P2PClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buf = Buffer.alloc(0);
  private state: P2PState = 'idle';
  private peerHeight = 0;

  constructor(
    private readonly peer: PeerAddress,
    private readonly network: BitcoinNetwork
  ) {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.connect({ host: this.peer.host, port: this.peer.port });

      const onError = (err: Error) => {
        this.socket?.destroy();
        reject(err);
      };

      this.socket.once('error', onError);
      this.socket.on('data', (data: Buffer) => this.onData(data));
      this.socket.on('close', () => this.emit('close'));
      this.socket.on('error', (err) => this.emit('error', err));

      this.socket.once('connect', () => {
        this.socket!.removeListener('error', onError);
        this.send(buildVersion(this.network, 0));
        this.state = 'version_sent';
      });

      this.once('ready', () => resolve());
      this.once('error', (err) => {
        if (this.state !== 'ready') reject(err);
      });
    });
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
    this.state = 'idle';
  }

  send(data: Buffer): void {
    this.socket?.write(data);
  }

  getPeerHeight(): number {
    return this.peerHeight;
  }

  private onData(data: Buffer): void {
    this.buf = Buffer.concat([this.buf, data]);

    while (true) {
      const result = parseMessage(this.buf);
      if (!result) break;
      this.buf = this.buf.subarray(result.consumed);
      this.handleMessage(result.msg.command, result.msg.payload);
    }
  }

  private handleMessage(command: string, payload: Buffer): void {
    switch (command) {
      case 'version':
        this.peerHeight = payload.readInt32LE(payload.length - 5);
        this.send(buildVerack(this.network));
        this.state = 'verack_sent';
        break;

      case 'verack':
        this.state = 'ready';
        this.emit('ready');
        break;

      case 'ping':
        this.send(buildPong(this.network, payload));
        break;

      case 'cfheaders':
        this.emit('cfheaders', this.parseCfheaders(payload));
        break;

      case 'cfilter':
        this.emit('cfilter', this.parseCfilter(payload));
        break;

      case 'headers':
        this.emit('headers', this.parseHeaders(payload));
        break;

      case 'inv':
      case 'addr':
      case 'feefilter':
      case 'sendcmpct':
      case 'sendheaders':
        // acknowledged but not processed
        break;
    }
  }

  private parseCfheaders(payload: Buffer): CfheadersMessage {
    let offset = 0;
    const filterType = payload[offset++];
    const stopHash = payload.subarray(offset, offset + 32);
    offset += 32;
    const previousFilterHeader = payload.subarray(offset, offset + 32);
    offset += 32;

    const { value: count, size } = decodeVarint(payload, offset);
    offset += size;

    const filterHashes: Buffer[] = [];
    for (let i = 0; i < count; i++) {
      filterHashes.push(Buffer.from(payload.subarray(offset, offset + 32)));
      offset += 32;
    }

    return { filterType, stopHash, previousFilterHeader, filterHashes };
  }

  private parseCfilter(payload: Buffer): CfilterMessage {
    let offset = 0;
    const filterType = payload[offset++];
    const blockHash = Buffer.from(payload.subarray(offset, offset + 32));
    offset += 32;

    const { value: numBytes, size } = decodeVarint(payload, offset);
    offset += size;

    const filterData = Buffer.from(payload.subarray(offset, offset + numBytes));
    return { filterType, blockHash, filterData };
  }

  private parseHeaders(payload: Buffer): HeadersMessage {
    const { value: count, size } = decodeVarint(payload, 0);
    let offset = size;
    const headers: Array<{ raw: Buffer; hash: Buffer }> = [];

    for (let i = 0; i < count; i++) {
      const raw = payload.subarray(offset, offset + 80);
      const { createHash } = require('crypto');
      const hash = createHash('sha256').update(
        createHash('sha256').update(raw).digest()
      ).digest().reverse();

      // skip tx count varint
      const { size: txCountSize } = decodeVarint(payload, offset + 80);
      offset += 80 + txCountSize;
      headers.push({ raw: Buffer.from(raw), hash });
    }

    return { headers };
  }
}
