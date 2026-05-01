import { ElectrumClient } from '../../src/electrum/ElectrumClient';

const SKIP = !process.env.INTEGRATION_TESTS;

describe('ElectrumClient (integration)', () => {
  let client: ElectrumClient;

  beforeAll(async () => {
    if (SKIP) return;
    client = new ElectrumClient({
      host: process.env.ELECTRUM_HOST ?? 'testnet.aranguren.org',
      port: parseInt(process.env.ELECTRUM_PORT ?? '51002', 10),
      tls: true,
      rejectUnauthorized: false,
    });
    await client.connect();
  }, 20_000);

  afterAll(() => {
    if (SKIP) return;
    client?.disconnect();
  });

  it('connects and subscribes to headers', async () => {
    if (SKIP) return;
    const headerSub = await new Promise<{ height: number }>((resolve) => {
      client.subscribeHeaders((h) => resolve(h));
      // initial header is returned by subscribeHeaders() itself
    });
    expect(typeof headerSub.height).toBe('number');
    expect(headerSub.height).toBeGreaterThan(0);
  }, 15_000);

  it('fetches address history for a known testnet address', async () => {
    if (SKIP) return;
    // This is the testnet faucet address — it always has history
    const history = await client.getHistory('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx');
    expect(Array.isArray(history)).toBe(true);
  }, 15_000);
});
