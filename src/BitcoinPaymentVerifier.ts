import * as bitcoin from 'bitcoinjs-lib';
import {
  VerifierConfig,
  VerifyOptions,
  VerifyResult,
  WatchOptions,
  WatchCallback,
  PaymentRequestOptions,
  PaymentRequest,
  ITransport,
  PaymentProof,
} from './types';
import { ElectrumTransport } from './electrum/ElectrumTransport';
import { Bip157Transport } from './bip157/Bip157Transport';
import { addressToScriptPubKey, getNetwork } from './utils/scriptpubkey';
import { sleep } from './utils/retry';

const DEFAULT_CONFIRMATIONS = 1;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

export class BitcoinPaymentVerifier {
  private transport: ITransport;
  private readonly config: Required<Pick<VerifierConfig, 'network' | 'mode' | 'confirmationsRequired' | 'timeoutMs'>>;

  constructor(cfg: VerifierConfig) {
    this.config = {
      network: cfg.network,
      mode: cfg.mode,
      confirmationsRequired: cfg.confirmationsRequired ?? DEFAULT_CONFIRMATIONS,
      timeoutMs: cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    if (cfg.mode === 'electrum') {
      if (!cfg.electrum) throw new Error('electrum config required for electrum mode');
      this.transport = new ElectrumTransport(cfg.electrum, cfg.network);
    } else {
      if (!cfg.bip157) throw new Error('bip157 config required for bip157 mode');
      this.transport = new Bip157Transport(cfg.bip157, cfg.network);
    }
  }

  async verify(options: VerifyOptions): Promise<VerifyResult> {
    const { address, expectedSats, fromHeight } = options;

    let scriptPubKey: Buffer;
    try {
      scriptPubKey = addressToScriptPubKey(address, this.config.network);
    } catch {
      return { verified: false, address, expectedSats, receivedSats: 0, error: `Invalid address: ${address}` };
    }

    await this.transport.connect();

    const currentHeight = await this.transport.getCurrentHeight();
    const searchFrom = fromHeight ?? Math.max(0, currentHeight - 6);

    const history = await this.transport.getHistory(address);
    const candidates = history.filter(
      entry => entry.height > 0 && entry.height >= searchFrom
    );

    let bestResult: VerifyResult = { verified: false, address, expectedSats, receivedSats: 0 };

    for (const entry of candidates) {
      const raw = await this.transport.getTransaction(entry.txid);
      const tx = bitcoin.Transaction.fromHex(raw.hex);

      let receivedSats = 0;
      for (const out of tx.outs) {
        if (out.script.equals(scriptPubKey)) {
          receivedSats += out.value;
        }
      }

      if (receivedSats === 0) continue;

      const confirmations = currentHeight - entry.height + 1;
      const verified = receivedSats >= expectedSats && confirmations >= this.config.confirmationsRequired;

      const proof: PaymentProof = { mode: this.config.mode };

      if (this.config.mode === 'electrum' && verified) {
        try {
          const electrumTransport = this.transport as ElectrumTransport;
          const merkle = await electrumTransport.getMerkleProof(entry.txid, entry.height);
          proof.merkleProof = {
            txid: entry.txid,
            blockHeight: merkle.block_height,
            position: merkle.pos,
            merkle: merkle.merkle,
          };
        } catch {
          // proof is optional; don't fail verification
        }
      }

      const result: VerifyResult = {
        verified,
        address,
        expectedSats,
        receivedSats,
        txid: entry.txid,
        blockHeight: entry.height,
        confirmations,
        proof,
      };

      if (verified) return result;
      if (!bestResult.txid) bestResult = result;
    }

    return bestResult;
  }

  async watchAddress(
    address: string,
    options: WatchOptions,
    callback: WatchCallback
  ): Promise<() => void> {
    await this.transport.connect();

    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    let stopped = false;
    const deadline = Date.now() + timeoutMs;

    const check = async () => {
      if (stopped) return;
      const result = await this.verify(options);
      callback(result);
      if (result.verified) stopped = true;
    };

    this.transport.subscribeHeaders(async () => {
      if (stopped || Date.now() > deadline) return;
      await check();
    });

    const poll = async () => {
      while (!stopped && Date.now() < deadline) {
        await check();
        await sleep(pollInterval);
      }
      if (!stopped) {
        callback({ verified: false, address, expectedSats: options.expectedSats, receivedSats: 0, error: 'Watch timeout' });
      }
    };

    poll();

    return () => { stopped = true; };
  }

  createPaymentRequest(options: PaymentRequestOptions): PaymentRequest {
    const { address, amountSats, label, message } = options;

    const params: string[] = [];
    if (amountSats !== undefined) {
      const btc = (amountSats / 1e8).toFixed(8).replace(/\.?0+$/, '');
      params.push(`amount=${btc}`);
    }
    if (label) params.push(`label=${encodeURIComponent(label)}`);
    if (message) params.push(`message=${encodeURIComponent(message)}`);

    const uri = params.length > 0
      ? `bitcoin:${address}?${params.join('&')}`
      : `bitcoin:${address}`;

    return { uri, address, amountSats };
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }
}
