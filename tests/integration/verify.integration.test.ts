import { BitcoinPaymentVerifier } from '../../src/BitcoinPaymentVerifier';

const SKIP = !process.env.INTEGRATION_TESTS;

describe('BitcoinPaymentVerifier (integration)', () => {
  let verifier: BitcoinPaymentVerifier;

  beforeAll(() => {
    if (SKIP) return;
    verifier = new BitcoinPaymentVerifier({
      mode: 'electrum',
      network: 'testnet',
      confirmationsRequired: 1,
      electrum: {
        host: process.env.ELECTRUM_HOST ?? 'testnet.aranguren.org',
        port: parseInt(process.env.ELECTRUM_PORT ?? '51002', 10),
        tls: true,
        rejectUnauthorized: false,
      },
    });
  });

  afterAll(async () => {
    if (SKIP) return;
    await verifier?.disconnect();
  });

  it('returns verified=false for an address with no relevant history', async () => {
    if (SKIP) return;
    // Freshly derived address — will have no history
    const result = await verifier.verify({
      address: 'tb1qrp33g0q5c5txsp9aryfvna6z5gnfh3yqkfyswc',
      expectedSats: 100000,
    });
    expect(result.verified).toBe(false);
    expect(result.address).toBe('tb1qrp33g0q5c5txsp9aryfvna6z5gnfh3yqkfyswc');
  }, 30_000);

  it('createPaymentRequest builds a valid BIP-21 URI', () => {
    if (SKIP) return;
    const req = verifier.createPaymentRequest({
      address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      amountSats: 100000,
      label: 'Order #1',
    });
    expect(req.uri).toMatch(/^bitcoin:tb1q/);
    expect(req.uri).toContain('amount=0.001');
    expect(req.uri).toContain('label=Order');
  });
});
