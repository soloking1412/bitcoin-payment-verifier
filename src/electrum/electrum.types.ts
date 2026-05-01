export interface ElectrumRequest {
  id: number;
  method: string;
  params: unknown[];
}

export interface ElectrumResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface ElectrumNotification {
  method: string;
  params: unknown[];
}

export interface ElectrumHistoryItem {
  tx_hash: string;
  height: number;
  fee?: number;
}

export interface ElectrumVerboseTx {
  txid: string;
  hex: string;
  confirmations?: number;
  blockheight?: number;
  time?: number;
  vout: Array<{
    value: number;
    n: number;
    scriptPubKey: {
      hex: string;
      address?: string;
    };
  }>;
}

export interface ElectrumHeader {
  height: number;
  hex: string;
}

export interface ElectrumMerkleResult {
  block_height: number;
  merkle: string[];
  pos: number;
}
