import { Router, Request, Response, NextFunction } from 'express';
import { BitcoinPaymentVerifier } from '../../BitcoinPaymentVerifier';

export function statusRouter(verifier: BitcoinPaymentVerifier): Router {
  const router = Router();

  router.get('/:address', async (req: Request, res: Response, next: NextFunction) => {
    const { address } = req.params;

    if (!address) {
      res.status(400).json({ error: 'address is required' });
      return;
    }

    try {
      // Access the underlying transport through the verifier to get raw history
      const result = await verifier.verify({
        address,
        expectedSats: 0,
        fromHeight: 0,
      });

      res.json({
        address,
        verified: result.verified,
        txid: result.txid,
        block_height: result.blockHeight,
        confirmations: result.confirmations,
        received_sats: result.receivedSats,
        last_checked: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
