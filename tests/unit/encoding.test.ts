import { encodeVarint, decodeVarint } from '../../src/utils/encoding';

describe('varint encoding', () => {
  const cases: Array<[number, number[]]> = [
    [0,          [0x00]],
    [1,          [0x01]],
    [252,        [0xfc]],
    [253,        [0xfd, 0xfd, 0x00]],
    [254,        [0xfd, 0xfe, 0x00]],
    [0xffff,     [0xfd, 0xff, 0xff]],
    [0x10000,    [0xfe, 0x00, 0x00, 0x01, 0x00]],
    [0xffffffff, [0xfe, 0xff, 0xff, 0xff, 0xff]],
  ];

  test.each(cases)('encodes %i correctly', (value, expected) => {
    expect([...encodeVarint(value)]).toEqual(expected);
  });

  test.each(cases)('round-trips %i', (value) => {
    const buf = encodeVarint(value);
    const { value: decoded, size } = decodeVarint(buf, 0);
    expect(decoded).toBe(value);
    expect(size).toBe(buf.length);
  });

  it('decodes from a non-zero offset', () => {
    const prefix = Buffer.from([0xde, 0xad]);
    const varint = encodeVarint(300);
    const combined = Buffer.concat([prefix, varint]);
    const { value, size } = decodeVarint(combined, 2);
    expect(value).toBe(300);
    expect(size).toBe(3);
  });
});
