import express, { Request, Response, NextFunction } from 'express';
import { BitcoinPaymentVerifier } from '../BitcoinPaymentVerifier';
import { VerifierConfig, BitcoinNetwork, TransportMode } from '../types';
import { healthRouter } from './routes/health';
import { verifyRouter } from './routes/verify';
import { statusRouter } from './routes/status';
import { watchRouter } from './routes/watch';

function loadConfig(): VerifierConfig {
  const network = (process.env.BITCOIN_NETWORK ?? 'testnet') as BitcoinNetwork;
  const mode = (process.env.TRANSPORT_MODE ?? 'electrum') as TransportMode;

  if (mode === 'electrum') {
    return {
      mode,
      network,
      confirmationsRequired: parseInt(process.env.CONFIRMATIONS_REQUIRED ?? '1', 10),
      electrum: {
        host: process.env.ELECTRUM_HOST ?? 'testnet.aranguren.org',
        port: parseInt(process.env.ELECTRUM_PORT ?? '51002', 10),
        tls: process.env.ELECTRUM_TLS !== 'false',
        rejectUnauthorized: process.env.ELECTRUM_REJECT_UNAUTHORIZED !== 'false',
      },
    };
  }

  return {
    mode,
    network,
    confirmationsRequired: parseInt(process.env.CONFIRMATIONS_REQUIRED ?? '1', 10),
    bip157: {
      filterCachePath: process.env.FILTER_CACHE_PATH ?? './data/filters',
      peers: (process.env.BIP157_PEERS ?? 'testnet.bitcoin.sipa.be:18333')
        .split(',')
        .map(p => {
          const [host, port] = p.split(':');
          return { host, port: parseInt(port, 10) };
        }),
    },
  };
}

export function createApp(): express.Application {
  const cfg = loadConfig();
  const verifier = new BitcoinPaymentVerifier(cfg);

  const app = express();
  app.use(express.json());

  app.use('/v1/health', healthRouter(cfg.network, cfg.mode));
  app.use('/v1/verify', verifyRouter(verifier));
  app.use('/v1/address', statusRouter(verifier));
  app.use('/v1/watch', watchRouter(verifier));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const message = err.message ?? 'Internal server error';
    const status = message.includes('Invalid address') ? 400 : 500;
    res.status(status).json({ error: message });
  });

  return app;
}

if (require.main === module) {
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const app = createApp();
  app.listen(port, () => {
    console.log(`bitcoin-payment-verifier listening on port ${port}`);
  });
}
