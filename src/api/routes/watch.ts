import { Router, Request, Response, NextFunction } from 'express';
import { BitcoinPaymentVerifier } from '../../BitcoinPaymentVerifier';
import { ApiWatchRequest, VerifyResult } from '../../types';

const activeWatchers = new Map<string, () => void>();

export function watchRouter(verifier: BitcoinPaymentVerifier): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as ApiWatchRequest;

    if (!body.address || typeof body.address !== 'string') {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    if (!body.expected_sats || typeof body.expected_sats !== 'number') {
      res.status(400).json({ error: 'expected_sats must be a number' });
      return;
    }
    if (!body.webhook_url || typeof body.webhook_url !== 'string') {
      res.status(400).json({ error: 'webhook_url is required' });
      return;
    }

    const key = `${body.address}:${body.expected_sats}`;
    if (activeWatchers.has(key)) {
      res.status(409).json({ error: 'Already watching this address' });
      return;
    }

    try {
      const stop = await verifier.watchAddress(
        body.address,
        {
          address: body.address,
          expectedSats: body.expected_sats,
          timeoutMs: (body.timeout_seconds ?? 600) * 1000,
        },
        async (result: VerifyResult) => {
          try {
            await fetch(body.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(result),
            });
          } catch {
            // webhook delivery failure is non-fatal
          }
          if (result.verified || result.error) {
            activeWatchers.delete(key);
          }
        }
      );

      activeWatchers.set(key, stop);

      res.status(202).json({
        watching: true,
        address: body.address,
        expected_sats: body.expected_sats,
        timeout_seconds: body.timeout_seconds ?? 600,
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:address', (req: Request, res: Response) => {
    const key = req.params.address;
    const stop = activeWatchers.get(key);
    if (stop) {
      stop();
      activeWatchers.delete(key);
      res.json({ stopped: true });
    } else {
      res.status(404).json({ error: 'No active watcher for this address' });
    }
  });

  return router;
}
