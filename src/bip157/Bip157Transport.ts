import { ITransport, TxHistoryEntry, RawTransaction, BlockHeader, Bip157Config, BitcoinNetwork } from '../types';
import { P2PClient } from './P2PClient';
import { FilterCache } from './FilterCache';
import { match } from './gcs';
import { buildGetcfheaders, buildGetcfilters } from './messages';
import { addressToScriptPubKey } from '../utils/scriptpubkey';

const BATCH_SIZE = 1000;

export class Bip157Transport implements ITransport {
  private client: P2PClient;
  private cache: FilterCache;
  private currentHeight = 0;
  private headerCallbacks: Array<(h: BlockHeader) => void> = [];

  constructor(private readonly config: Bip157Config, private readonly network: BitcoinNetwork) {
    const peer = config.peers[0];
    if (!peer) throw new Error('At least one peer is required for bip157 mode');
    this.client = new P2PClient(peer, network);
    this.cache = new FilterCache(config.filterCachePath);
  }

  async connect(): Promise<void> {
    await this.cache.open();
    await this.client.connect();
    this.currentHeight = this.client.getPeerHeight();

    this.client.on('headers', (msg) => {
      if (msg.headers.length > 0) {
        this.currentHeight++;
        for (const cb of this.headerCallbacks) {
          cb({ height: this.currentHeight, hash: msg.headers[0].hash.toString('hex') });
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    this.client.disconnect();
    await this.cache.close();
  }

  async getHistory(address: string): Promise<TxHistoryEntry[]> {
    const scriptPubKey = addressToScriptPubKey(address, this.network);
    const startHeight = this.config.startHeight ?? Math.max(0, this.currentHeight - 144);
    const matches: TxHistoryEntry[] = [];

    for (let h = startHeight; h <= this.currentHeight; h += BATCH_SIZE) {
      const end = Math.min(h + BATCH_SIZE - 1, this.currentHeight);
      const blockMatches = await this.scanRange(h, end, scriptPubKey);
      matches.push(...blockMatches);
    }

    return matches;
  }

  private scanRange(startHeight: number, endHeight: number, scriptPubKey: Buffer): Promise<TxHistoryEntry[]> {
    return new Promise((resolve, reject) => {
      // In production, stopHash would be fetched from the headers chain.
      // For the MVP, we use a zero hash as a placeholder — peers that implement
      // BIP-157 will respond up to their best-known block in the range.
      const stopHash = Buffer.alloc(32);
      this.client.send(buildGetcfilters(this.network, startHeight, stopHash));

      const results: TxHistoryEntry[] = [];
      let received = 0;
      const expected = endHeight - startHeight + 1;

      const timeout = setTimeout(() => {
        this.client.removeListener('cfilter', onCfilter);
        resolve(results);
      }, 30_000);

      const onCfilter = (msg: { blockHash: Buffer; filterData: Buffer }) => {
        received++;
        if (match(msg.filterData, msg.blockHash, scriptPubKey)) {
          results.push({
            txid: msg.blockHash.toString('hex'),
            height: startHeight + received - 1,
          });
        }
        if (received >= expected) {
          clearTimeout(timeout);
          this.client.removeListener('cfilter', onCfilter);
          resolve(results);
        }
      };

      this.client.on('cfilter', onCfilter);
    });
  }

  async getTransaction(_txid: string): Promise<RawTransaction> {
    // BIP-157 mode requires downloading the full block to retrieve a transaction.
    // Full block download (MSG_BLOCK via getdata) is implemented in the next
    // development phase. For now, throw a clear error.
    throw new Error(
      'BIP-157 mode: full block download for individual transaction retrieval is not yet implemented. ' +
      'Use electrum mode or provide the transaction hex directly.'
    );
  }

  async getCurrentHeight(): Promise<number> {
    return this.currentHeight;
  }

  subscribeHeaders(cb: (header: BlockHeader) => void): void {
    this.headerCallbacks.push(cb);
  }
}
