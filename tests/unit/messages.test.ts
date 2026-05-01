import { buildMessage, parseMessage, buildVerack, buildGetcfheaders, buildGetcfilters } from '../../src/bip157/messages';

describe('P2P message framing', () => {
  describe('buildMessage / parseMessage', () => {
    it('round-trips an empty payload (verack)', () => {
      const msg = buildVerack('testnet');
      const result = parseMessage(msg);
      expect(result).not.toBeNull();
      expect(result!.msg.command).toBe('verack');
      expect(result!.msg.payload.length).toBe(0);
      expect(result!.consumed).toBe(24);
    });

    it('round-trips a non-empty payload', () => {
      const payload = Buffer.from('hello world', 'ascii');
      const msg = buildMessage('mainnet', 'test', payload);
      const result = parseMessage(msg);
      expect(result).not.toBeNull();
      expect(result!.msg.command).toBe('test');
      expect(result!.msg.payload.toString('ascii')).toBe('hello world');
    });

    it('uses correct magic bytes for mainnet', () => {
      const msg = buildVerack('mainnet');
      expect(msg[0]).toBe(0xf9);
      expect(msg[1]).toBe(0xbe);
      expect(msg[2]).toBe(0xb4);
      expect(msg[3]).toBe(0xd9);
    });

    it('uses correct magic bytes for testnet', () => {
      const msg = buildVerack('testnet');
      expect(msg[0]).toBe(0x0b);
      expect(msg[1]).toBe(0x11);
      expect(msg[2]).toBe(0x09);
      expect(msg[3]).toBe(0x07);
    });

    it('returns null for incomplete buffer', () => {
      const msg = buildVerack('mainnet');
      const partial = msg.subarray(0, 10);
      expect(parseMessage(partial)).toBeNull();
    });

    it('returns null for bad checksum', () => {
      const msg = buildVerack('mainnet');
      const corrupted = Buffer.from(msg);
      corrupted[20] ^= 0xff;
      expect(parseMessage(corrupted)).toBeNull();
    });

    it('null-pads command to 12 bytes', () => {
      const msg = buildVerack('mainnet');
      const commandField = msg.subarray(4, 16);
      expect(commandField.subarray(6).every(b => b === 0)).toBe(true);
    });
  });

  describe('getcfheaders', () => {
    it('builds correct payload structure', () => {
      const stopHash = Buffer.alloc(32, 0xab);
      const msg = buildGetcfheaders('mainnet', 840000, stopHash);
      const result = parseMessage(msg);
      expect(result).not.toBeNull();
      expect(result!.msg.command).toBe('getcfheaders');
      const payload = result!.msg.payload;
      expect(payload[0]).toBe(0x00); // filter type
      expect(payload.readUInt32LE(1)).toBe(840000);
      expect(payload.subarray(5, 37).equals(stopHash)).toBe(true);
    });
  });

  describe('getcfilters', () => {
    it('builds correct payload structure', () => {
      const stopHash = Buffer.alloc(32, 0xcd);
      const msg = buildGetcfilters('testnet', 2800000, stopHash);
      const result = parseMessage(msg);
      expect(result).not.toBeNull();
      expect(result!.msg.command).toBe('getcfilters');
      const payload = result!.msg.payload;
      expect(payload[0]).toBe(0x00);
      expect(payload.readUInt32LE(1)).toBe(2800000);
    });
  });
});
