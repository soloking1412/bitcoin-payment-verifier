# bitcoin-payment-verifier

A Node.js library and self-hostable REST API for verifying Bitcoin payments without running a full node. It connects directly to the Bitcoin peer-to-peer network using BIP-157/158 compact block filters, or falls back to the Electrum protocol for lighter deployments.

The library answers one question: *was address X paid Y satoshis, confirmed N times?* It does this without trusting a third-party API and without the 100 GB storage requirement of a full node.

---

## Why this exists

Payment processors and Bitcoin libraries today split into two camps: run a full node (expensive, operationally heavy) or call a hosted API like BlockCypher or Mempool.space (custodial, surveillance-prone, a point of failure). For indie developers, small merchants, and embedded payment flows, neither is a good fit.

BIP-157/158 (the Neutrino protocol) defines a way for light clients to download compact block filters — compact summaries of every transaction in a block — and check locally whether a given address appears, then fetch only the blocks that match. The privacy and trust model is substantially better than a hosted API, and the bandwidth and storage cost is a fraction of a full node.

This library implements that filter protocol and wraps it in an interface simple enough to drop into any Node.js backend in a few lines.

---

## Architecture

```
┌────────────────────────────────────────────────┐
│           BitcoinPaymentVerifier               │
│                                                │
│  verify()         watchAddress()               │
│  createPaymentRequest()                        │
│                                                │
│           ITransport interface                 │
│         ┌──────────┴──────────┐               │
│         │                     │               │
│  ElectrumTransport     Bip157Transport        │
│         │                     │               │
│   TLS JSON-RPC          Raw TCP P2P           │
│   to Electrum server    to Bitcoin peers      │
│                         + GCS filter match    │
│                         + LevelDB cfheader    │
│                           cache               │
└────────────────────────────────────────────────┘

REST API (Express)
  POST /v1/verify
  GET  /v1/address/:address/status
  POST /v1/watch
  GET  /v1/health
```

**Electrum mode** connects over TLS to any Electrum server using the standard JSON-RPC protocol. It is faster and easier to deploy. You can run your own Electrum server (Electrs, ElectrumX) to remove the server trust entirely.

**BIP-157/158 mode** connects directly to Bitcoin Core peers that signal `NODE_COMPACT_FILTERS` (service bit 6). It downloads filter headers, performs local GCS filter matching against the target scriptPubKey, and fetches only blocks where the filter matches. No server trust is required — the filter header chain is verified locally and cached in LevelDB.

---

## Install

```bash
npm install bitcoin-payment-verifier
```

Requires Node.js 18 or later.

---

## Usage

### Node.js library

```typescript
import { BitcoinPaymentVerifier } from 'bitcoin-payment-verifier';

const verifier = new BitcoinPaymentVerifier({
  mode: 'electrum',
  network: 'mainnet',
  confirmationsRequired: 3,
  electrum: {
    host: 'electrum.blockstream.info',
    port: 50002,
    tls: true,
  },
});

const result = await verifier.verify({
  address: 'bc1q...',
  expectedSats: 100000,
});

if (result.verified) {
  console.log(result.txid, result.confirmations);
  // result.proof contains the merkle branch for independent verification
}
```

#### Generate a BIP-21 payment URI

```typescript
const req = verifier.createPaymentRequest({
  address: 'bc1q...',
  amountSats: 100000,
  label: 'Order #1234',
});
// req.uri → "bitcoin:bc1q...?amount=0.001&label=Order%20%231234"
```

#### Watch for a payment

```typescript
const stop = await verifier.watchAddress(
  'bc1q...',
  { address: 'bc1q...', expectedSats: 100000, timeoutMs: 600_000 },
  (result) => {
    if (result.verified) {
      console.log('paid:', result.txid);
      stop();
    }
  }
);
```

In Electrum mode the watcher subscribes to block headers via `blockchain.headers.subscribe` and triggers on each new block, so confirmation latency follows block time rather than a polling interval.

#### BIP-157 mode

```typescript
const verifier = new BitcoinPaymentVerifier({
  mode: 'bip157',
  network: 'mainnet',
  bip157: {
    peers: [{ host: 'seed.bitcoin.sipa.be', port: 8333 }],
    filterCachePath: './data/filters',
  },
});
```

The library connects to the peer, completes the version handshake, downloads compact filter headers for the relevant block range, and checks the GCS filter for the target scriptPubKey locally. Matched filter headers are cached in LevelDB so they are not re-downloaded on reconnect.

---

### REST API

Copy `.env.example` to `.env`, set your values, then:

```bash
npm run dev
```

#### `POST /v1/verify`

```json
{
  "address": "bc1q...",
  "expected_sats": 100000,
  "min_confirmations": 3
}
```

Response:

```json
{
  "verified": true,
  "address": "bc1q...",
  "expectedSats": 100000,
  "receivedSats": 100000,
  "txid": "abc123...",
  "blockHeight": 845123,
  "confirmations": 4,
  "proof": { "mode": "electrum", "merkleProof": { ... } }
}
```

#### `GET /v1/address/:address/status`

Returns the latest known state for an address — received sats, confirmation count, and the most recent txid.

#### `POST /v1/watch`

```json
{
  "address": "bc1q...",
  "expected_sats": 100000,
  "webhook_url": "https://yourserver.com/bitcoin-callback",
  "timeout_seconds": 600
}
```

The server watches the address and POSTs the `VerifyResult` JSON to `webhook_url` when payment is confirmed, or when the timeout expires.

#### `GET /v1/health`

```json
{ "status": "ok", "network": "mainnet", "mode": "electrum" }
```

---

### Docker

```bash
docker-compose up -d verifier-testnet
```

This starts the testnet instance on port 3001. For mainnet, use the `verifier` service (port 3000). The LevelDB filter cache is stored in a named volume.

```bash
docker build -t bitcoin-payment-verifier .
docker run -p 3000:3000 \
  -e BITCOIN_NETWORK=mainnet \
  -e ELECTRUM_HOST=electrum.blockstream.info \
  -e ELECTRUM_PORT=50002 \
  bitcoin-payment-verifier
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `BITCOIN_NETWORK` | `testnet` | `mainnet`, `testnet`, or `regtest` |
| `TRANSPORT_MODE` | `electrum` | `electrum` or `bip157` |
| `ELECTRUM_HOST` | `testnet.aranguren.org` | Electrum server hostname |
| `ELECTRUM_PORT` | `51002` | Electrum server port (50002 mainnet, 51002 testnet) |
| `ELECTRUM_TLS` | `true` | Use TLS for Electrum connection |
| `ELECTRUM_REJECT_UNAUTHORIZED` | `false` | Reject self-signed TLS certificates |
| `BIP157_PEERS` | `testnet.bitcoin.sipa.be:18333` | Comma-separated `host:port` list |
| `FILTER_CACHE_PATH` | `./data/filters` | LevelDB directory for cfheader cache |
| `CONFIRMATIONS_REQUIRED` | `1` | Minimum confirmations to consider a payment verified |
| `PORT` | `3000` | HTTP port for the REST API |

---

## Transport comparison

| | Electrum | BIP-157/158 |
|---|---|---|
| Trust model | Trust the Electrum server | Trustless (local filter verification) |
| Privacy | Server sees your addresses | Probabilistic privacy via filter false positives |
| Speed | Fast (single server round-trip) | Slower (P2P filter download + block fetch on match) |
| Self-hostable | Yes (Electrs, ElectrumX) | Yes (Bitcoin peers with NODE_COMPACT_FILTERS) |
| Bandwidth | Low | Low (filters only; blocks fetched on match) |

For most applications, Electrum mode pointing at a self-hosted Electrs instance gives a good balance of speed and trust. BIP-157 mode is appropriate when you need fully trustless verification without running your own Electrum server.

---

## Development

```bash
npm install
npm run build
npm test
```

Integration tests require a live Electrum connection:

```bash
INTEGRATION_TESTS=1 ELECTRUM_HOST=testnet.aranguren.org ELECTRUM_PORT=51002 npm run test:integration
```

---

## License

MIT — Copyright 2026 Maheswaran Velmurugan
