import * as tls from 'tls';
import * as net from 'net';
import { EventEmitter } from 'events';
import { ElectrumConfig } from '../types';
import {
  ElectrumRequest,
  ElectrumResponse,
  ElectrumNotification,
  ElectrumHistoryItem,
  ElectrumVerboseTx,
  ElectrumHeader,
  ElectrumMerkleResult,
} from './electrum.types';
import { withRetry } from '../utils/retry';

const KEEPALIVE_INTERVAL_MS = 45_000;
const CLIENT_VERSION = 'bitcoin-payment-verifier/0.1.0';
const PROTOCOL_VERSION = '1.4';

export class ElectrumClient extends EventEmitter {
  private socket: tls.TLSSocket | net.Socket | null = null;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private subscriptions = new Map<string, (params: unknown[]) => void>();
  private nextId = 1;
  private buffer = '';
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private connected = false;

  constructor(private readonly config: ElectrumConfig) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await withRetry(() => this.attemptConnect(), { baseMs: 1000, multiplier: 2, maxMs: 60000 });
  }

  private attemptConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket?.destroy();
        reject(err);
      };

      if (this.config.tls) {
        this.socket = tls.connect({
          host: this.config.host,
          port: this.config.port,
          rejectUnauthorized: this.config.rejectUnauthorized ?? true,
        });
      } else {
        this.socket = net.connect({ host: this.config.host, port: this.config.port });
      }

      this.socket.once('error', onError);

      this.socket.once('connect', async () => {
        this.socket!.removeListener('error', onError);
        this.socket!.on('data', (data: Buffer) => this.onData(data));
        this.socket!.on('error', (err) => this.onSocketError(err));
        this.socket!.on('close', () => this.onSocketClose());

        try {
          await this.serverVersion();
          this.connected = true;
          this.startKeepalive();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  disconnect(): void {
    this.connected = false;
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.socket?.destroy();
    this.socket = null;
    for (const { reject } of this.pending.values()) {
      reject(new Error('Disconnected'));
    }
    this.pending.clear();
  }

  private onData(data: Buffer): void {
    this.buffer += data.toString('utf8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.dispatch(JSON.parse(line));
      } catch {
        // malformed line; skip
      }
    }
  }

  private dispatch(msg: ElectrumResponse | ElectrumNotification): void {
    if ('id' in msg && msg.id !== undefined && msg.id !== null) {
      const resp = msg as ElectrumResponse;
      const pending = this.pending.get(resp.id);
      if (!pending) return;
      this.pending.delete(resp.id);
      if (resp.error) {
        pending.reject(new Error(`Electrum error ${resp.error.code}: ${resp.error.message}`));
      } else {
        pending.resolve(resp.result);
      }
    } else {
      const notif = msg as ElectrumNotification;
      const handler = this.subscriptions.get(notif.method);
      if (handler) handler(notif.params);
    }
  }

  private onSocketError(err: Error): void {
    this.emit('error', err);
  }

  private onSocketClose(): void {
    this.connected = false;
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.emit('close');
  }

  private call<T>(method: string, params: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        return reject(new Error('Not connected'));
      }
      const id = this.nextId++;
      const req: ElectrumRequest = { id, method, params };
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.socket.write(JSON.stringify(req) + '\n');
    });
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(async () => {
      try {
        await this.call('server.ping', []);
      } catch {
        // socket error will be emitted separately
      }
    }, KEEPALIVE_INTERVAL_MS);
    this.keepaliveTimer.unref();
  }

  private async serverVersion(): Promise<void> {
    await this.call('server.version', [CLIENT_VERSION, PROTOCOL_VERSION]);
  }

  async getHistory(address: string): Promise<ElectrumHistoryItem[]> {
    return this.call<ElectrumHistoryItem[]>('blockchain.address.get_history', [address]);
  }

  async getTransaction(txid: string): Promise<ElectrumVerboseTx> {
    return this.call<ElectrumVerboseTx>('blockchain.transaction.get', [txid, true]);
  }

  async getTransactionHex(txid: string): Promise<string> {
    return this.call<string>('blockchain.transaction.get', [txid, false]);
  }

  async getMerkleProof(txid: string, height: number): Promise<ElectrumMerkleResult> {
    return this.call<ElectrumMerkleResult>('blockchain.transaction.get_merkle', [txid, height]);
  }

  async subscribeHeaders(cb: (header: ElectrumHeader) => void): Promise<ElectrumHeader> {
    this.subscriptions.set('blockchain.headers.subscribe', (params) => {
      cb(params[0] as ElectrumHeader);
    });
    return this.call<ElectrumHeader>('blockchain.headers.subscribe', []);
  }
}
