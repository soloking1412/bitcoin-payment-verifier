import { Router, Request, Response } from 'express';

export function healthRouter(network: string, mode: string): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', network, mode, timestamp: Date.now() });
  });

  return router;
}
