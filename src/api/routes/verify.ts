import { Router, Request, Response, NextFunction } from 'express';
import { BitcoinPaymentVerifier } from '../../BitcoinPaymentVerifier';
import { ApiVerifyRequest } from '../../types';

export function verifyRouter(verifier: BitcoinPaymentVerifier): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as ApiVerifyRequest;

    if (!body.address || typeof body.address !== 'string') {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    if (!body.expected_sats || typeof body.expected_sats !== 'number') {
      res.status(400).json({ error: 'expected_sats must be a number' });
      return;
    }

    try {
      const result = await verifier.verify({
        address: body.address,
        expectedSats: body.expected_sats,
        fromHeight: body.from_height,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
