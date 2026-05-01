export type TransportMode = 'electrum' | 'bip157';
export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';

export interface VerifierConfig {
  mode: TransportMode;
  network: BitcoinNetwork;
  electrum?: ElectrumConfig;
  bip157?: Bip157Config;
  confirmationsRequired?: number;
  timeoutMs?: number;
}

export interface ElectrumConfig {
  host: string;
  port: number;
  tls: boolean;
  rejectUnauthorized?: boolean;
}

export interface Bip157Config {
  peers: PeerAddress[];
  filterCachePath: string;
  startHeight?: number;
}

export interface PeerAddress {
  host: string;
  port: number;
}

export interface VerifyOptions {
  address: string;
  expectedSats: number;
  fromHeight?: number;
  timeoutMs?: number;
}

export interface VerifyResult {
  verified: boolean;
  address: string;
  expectedSats: number;
  receivedSats: number;
  txid?: string;
  blockHeight?: number;
  confirmations?: number;
  proof?: PaymentProof;
  error?: string;
}

export interface PaymentProof {
  mode: TransportMode;
  merkleProof?: {
    txid: string;
    blockHeight: number;
    position: number;
    merkle: string[];
  };
  filterProof?: {
    cfheader: string;
    blockHash: string;
  };
}

export interface WatchOptions extends VerifyOptions {
  pollIntervalMs?: number;
}

export type WatchCallback = (result: VerifyResult) => void;

export interface PaymentRequestOptions {
  address: string;
  amountSats?: number;
  label?: string;
  message?: string;
}

export interface PaymentRequest {
  uri: string;
  address: string;
  amountSats?: number;
}

export interface ITransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getHistory(address: string): Promise<TxHistoryEntry[]>;
  getTransaction(txid: string): Promise<RawTransaction>;
  getCurrentHeight(): Promise<number>;
  subscribeHeaders(cb: (header: BlockHeader) => void): void;
}

export interface TxHistoryEntry {
  txid: string;
  height: number;
}

export interface RawTransaction {
  txid: string;
  hex: string;
  blockHeight?: number;
  confirmations?: number;
}

export interface BlockHeader {
  height: number;
  hash: string;
  timestamp?: number;
}

export interface ApiVerifyRequest {
  address: string;
  expected_sats: number;
  txid?: string;
  min_confirmations?: number;
  from_height?: number;
}

export interface ApiWatchRequest {
  address: string;
  expected_sats: number;
  webhook_url: string;
  timeout_seconds?: number;
  min_confirmations?: number;
}
