import * as bitcoin from 'bitcoinjs-lib';
import { ITransport, TxHistoryEntry, RawTransaction, BlockHeader, ElectrumConfig, BitcoinNetwork } from '../types';
import { ElectrumClient } from './ElectrumClient';

export class ElectrumTransport implements ITransport {
  private client: ElectrumClient;
  private currentHeight = 0;

  constructor(config: ElectrumConfig, private readonly network: BitcoinNetwork) {
    this.client = new ElectrumClient(config);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const tip = await this.client.subscribeHeaders((header) => {
      this.currentHeight = header.height;
    });
    this.currentHeight = tip.height;
  }

  async disconnect(): Promise<void> {
    this.client.disconnect();
  }

  async getHistory(address: string): Promise<TxHistoryEntry[]> {
    const items = await this.client.getHistory(address);
    return items.map(item => ({ txid: item.tx_hash, height: item.height }));
  }

  async getTransaction(txid: string): Promise<RawTransaction> {
    const tx = await this.client.getTransaction(txid);
    const hex = tx.hex ?? await this.client.getTransactionHex(txid);
    return {
      txid: tx.txid,
      hex,
      blockHeight: tx.blockheight,
      confirmations: tx.confirmations,
    };
  }

  async getCurrentHeight(): Promise<number> {
    return this.currentHeight;
  }

  subscribeHeaders(cb: (header: BlockHeader) => void): void {
    this.client.subscribeHeaders((h) => {
      this.currentHeight = h.height;
      cb({ height: h.height, hash: '' });
    });
  }

  async getMerkleProof(txid: string, height: number) {
    return this.client.getMerkleProof(txid, height);
  }
}
