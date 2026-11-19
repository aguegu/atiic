// the SHT4x driver against a fake sensor: 8-bit commands, waits, CRCs,
// formulas, the heater; and the SHT3x's check not thrown by an SHT4x
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Sht4x, Sht3x } from '../../src/index.js';
import { crc8 } from '../../src/devices/sht4x.js';

const words = (a, b) => Uint8Array.of(a >> 8, a & 0xff, crc8([a >> 8, a & 0xff]), b >> 8, b & 0xff, crc8([b >> 8, b & 0xff]));
const OURS_SERIAL = Uint8Array.of(0x17, 0x9f, 0x56, 0xe7, 0x68, 0x5b); // Dart-8346's SHT40, as read

class FakeSht4 {
  constructor(t = 0x6389, rh = 0x7dc5) { this.t = t; this.rh = rh; this.log = []; this.next = null; }
  async write(address, bytes) {
    if (bytes.length > 1) throw new Error(`0x${address.toString(16)} refused byte 1`); // no 16-bit commands
    this.log.push(['write', ...bytes]);
    this.next = bytes[0];
  }
  async read(address, n) {
    this.log.push(['read', n]);
    return this.next === 0x89 ? OURS_SERIAL : words(this.t, this.rh);
  }
  async writeRead(address, bytes, n) { await this.write(address, bytes); return this.read(address, n); }
}

describe('sht4x (host)', () => {
  it('crc8: Table 6\'s example, CRC(0xBEEF) = 0x92; our serial number\'s CRCs hold', () => {
    assert.equal(crc8([0xbe, 0xef]), 0x92);
    assert.equal(crc8([0x17, 0x9f]), 0x56);
    assert.equal(crc8([0xe7, 0x68]), 0x5b);
  });

  it('measure: 0xFD, its 8.2 ms, 6 bytes, T first; the formulas (2^16 - 1), RH uncropped', async () => {
    const f = new FakeSht4(0x6389, 0x7dc5);
    const t0 = Date.now();
    const r = await new Sht4x(f).measure();
    assert.ok(Date.now() - t0 >= 8, 'waited');
    assert.deepEqual(f.log, [['write', 0xfd], ['read', 6]]);
    assert.ok(Math.abs(r.temperature - (-45 + (175 * 0x6389) / 65535)) < 1e-9);
    assert.ok(Math.abs(r.humidity - (-6 + (125 * 0x7dc5) / 65535)) < 1e-9);
    const low = await new Sht4x(new FakeSht4(0x6389, 0x0000)).measure();
    assert.equal(low.humidity, -6); // as it comes: cropping left to the caller
  });

  it('the repeatabilities: 0xF6 medium, 0xE0 low; an unknown one throws', async () => {
    for (const [name, cmd] of [['medium', 0xf6], ['low', 0xe0]]) {
      const f = new FakeSht4();
      await new Sht4x(f, 0x44, { repeatability: name }).measure();
      assert.equal(f.log[0][1], cmd);
    }
    assert.throws(() => new Sht4x(new FakeSht4(), 0x44, { repeatability: 'max' }), /no repeatability max: high, medium, low/);
  });

  it('a bad CRC throws', async () => {
    const f = new FakeSht4();
    f.read = async () => Uint8Array.of(0x63, 0x89, 0x00, 0x7d, 0xc5, 0x00);
    await assert.rejects(new Sht4x(f).measure(), /SHT4x temperature CRC/);
  });

  it('serialNumber: 0x89, two words: ours 0x179FE768', async () => {
    assert.equal(await new Sht4x(new FakeSht4()).serialNumber(), 0x179fe768);
  });

  it('heat: 0x32 for 200 mW 0.1 s, then its measurement; 20 mW 1 s is 0x1E; an unknown power throws', async () => {
    const f = new FakeSht4();
    const t0 = Date.now();
    await new Sht4x(f).heat(200);
    assert.ok(Date.now() - t0 >= 118, 'the pulse and the measurement waited');
    assert.deepEqual(f.log, [['write', 0x32], ['read', 6]]);
    assert.equal(Sht4x.HEATER[20].long, 0x1e);
    await assert.rejects(new Sht4x(f).heat(50), /no heater power 50 mW: 20, 110, 200/);
  });

  it('identify: its serial number\'s CRCs; and the SHT3x\'s check says no, not throws, on an SHT4x', async () => {
    assert.equal(await Sht4x.chip.identify(new FakeSht4(), 0x44), true);
    const bad = new FakeSht4();
    bad.read = async () => Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
    assert.equal(await Sht4x.chip.identify(bad, 0x44), false);
    assert.equal(await Sht3x.chip.identify(new FakeSht4(), 0x44), false);
    const nack = new FakeSht4();
    nack.read = async () => { throw new Error('no ack from 0x44'); };
    assert.equal(await Sht4x.chip.identify(nack, 0x44), false);
  });
});
