import { BitcoinPaymentVerifier } from '../src';

async function main() {
  const verifier = new BitcoinPaymentVerifier({
    mode: 'electrum',
    network: 'testnet',
    confirmationsRequired: 1,
    electrum: {
      host: 'testnet.aranguren.org',
      port: 51002,
      tls: true,
      rejectUnauthorized: false,
    },
  });

  // Generate a payment request URI
  const request = verifier.createPaymentRequest({
    address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    amountSats: 50000,
    label: 'Order #42',
  });
  console.log('Payment URI:', request.uri);

  // One-shot verification
  const result = await verifier.verify({
    address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    expectedSats: 50000,
  });

  if (result.verified) {
    console.log('Payment confirmed');
    console.log('  txid:          ', result.txid);
    console.log('  confirmations: ', result.confirmations);
    console.log('  received sats: ', result.receivedSats);
  } else {
    console.log('Payment not yet confirmed');
    if (result.receivedSats > 0) {
      console.log('  received', result.receivedSats, 'sats but need', result.expectedSats);
    }
  }

  // Watch for an incoming payment with a callback
  console.log('\nWatching for payment (30 second timeout)...');
  const stop = await verifier.watchAddress(
    'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    { address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', expectedSats: 50000, timeoutMs: 30_000 },
    (event) => {
      if (event.verified) {
        console.log('Payment received:', event.txid);
        stop();
      }
    }
  );

  await verifier.disconnect();
}

main().catch(console.error);
