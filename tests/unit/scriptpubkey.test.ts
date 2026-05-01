import { addressToScriptPubKey } from '../../src/utils/scriptpubkey';

describe('addressToScriptPubKey', () => {
  describe('mainnet', () => {
    it('P2PKH', () => {
      // 1111...4oLvT2 is the well-known burn address whose hash160 is all zeros
      const script = addressToScriptPubKey('1111111111111111111114oLvT2', 'mainnet');
      expect(script.toString('hex')).toBe('76a914000000000000000000000000000000000000000088ac');
    });

    it('P2WPKH (bech32)', () => {
      const script = addressToScriptPubKey('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet');
      expect(script[0]).toBe(0x00); // OP_0
      expect(script[1]).toBe(0x14); // PUSH 20
      expect(script.length).toBe(22);
    });

    it('throws on invalid address', () => {
      expect(() => addressToScriptPubKey('notanaddress', 'mainnet')).toThrow();
    });

    it('throws on testnet address used with mainnet', () => {
      expect(() =>
        addressToScriptPubKey('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'mainnet')
      ).toThrow();
    });
  });

  describe('testnet', () => {
    it('P2WPKH (bech32)', () => {
      const script = addressToScriptPubKey('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'testnet');
      expect(script[0]).toBe(0x00);
      expect(script[1]).toBe(0x14);
      expect(script.length).toBe(22);
    });

    it('P2PKH testnet', () => {
      const script = addressToScriptPubKey('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet');
      expect(script[0]).toBe(0x76); // OP_DUP
    });
  });
});
