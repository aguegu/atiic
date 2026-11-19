// the HDC1080 driver against a fake sensor: registers, the configuration,
// the wait (and a NACK while not ready), the formulas; and the 0x40 checks
// of the SHT20, HTU21D and INA231 saying no to it, not throwing
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hdc1080, Sht20, Htu21d, Ina231 } from '../../src/index.js';

// Dart-8346's HDC1080, as read
const REGS = { 0x02: 0x1000, 0xfb: 0x0279, 0xfc: 0x9707, 0xfd: 0x7a80, 0xfe: 0x5449, 0xff: 0x1050 };
const READ_ONLY = [0x00, 0x01, 0xfb, 0xfc, 0xfd, 0xfe, 0xff];

class FakeHdc {
  constructor({ t = 0x612c, rh = 0x9898, notReady = 0 } = {}) { Object.assign(this, { t, rh, notReady }); this.regs = { ...REGS }; this.pointer = 0; this.log = []; }
  async write(address, bytes) {
    this.pointer = bytes[0];
    if (bytes.length > 1 && READ_ONLY.includes(bytes[0])) throw new Error(`0x${address.toString(16)} refused byte 1`);
    if (bytes.length === 3) this.regs[bytes[0]] = ((bytes[1] << 8) | bytes[2]) & ~0x8000; // RST self-clears
    this.log.push(['write', ...bytes]);
  }
  async read(address, n) {
    if (this.pointer === 0x00 && n === 4) {
      if (this.notReady-- > 0) throw new Error(`no ack from 0x${address.toString(16)}`);
      this.log.push(['read', 4]);
      return Uint8Array.of(this.t >> 8, this.t & 0xff, this.rh >> 8, this.rh & 0xff);
    }
    const v = this.regs[this.pointer] ?? 0;
    return Uint8Array.of(v >> 8, v & 0xff);
  }
  async writeRead(address, bytes, n) { await this.write(address, bytes); return this.read(address, n); }
}

describe('hdc1080 (host)', () => {
  it('identify: TI at 0xFE and 0x1050 at 0xFF', async () => {
    assert.equal(await Hdc1080.chip.identify(new FakeHdc(), 0x40), true);
    const other = new FakeHdc();
    other.regs[0xff] = 0x2260; // r8845's INA226-alike
    assert.equal(await Hdc1080.chip.identify(other, 0x40), false);
  });

  it('the other 0x40 checks say no to it: the SHT20\'s and HTU21D\'s (refused, not thrown), the INA231\'s (0x1050 at 0xFF)', async () => {
    assert.equal(await Sht20.chip.identify(new FakeHdc(), 0x40), false);
    assert.equal(await Htu21d.chip.identify(new FakeHdc(), 0x40), false);
    assert.equal(await Ina231.chip.identify(new FakeHdc(), 0x40), false);
    const ina = new FakeHdc();
    ina.regs[0xff] = 0x2260;
    assert.equal(await Ina231.chip.identify(ina, 0x40), true);
  });

  it('init: RST, then both at 14 bits (0x1000)', async () => {
    const f = new FakeHdc();
    await new Hdc1080(f).init();
    assert.deepEqual(f.log, [['write', 0x02, 0x80, 0x00], ['write', 0x02, 0x10, 0x00]]);
  });

  it('measure: the pointer to 0x00, the typical sum waited, 4 bytes; the formulas', async () => {
    const f = new FakeHdc({ t: 0x612c, rh: 0x9898 });
    const t0 = Date.now();
    const r = await new Hdc1080(f).measure();
    assert.ok(Date.now() - t0 >= 12, 'waited 12.85 ms');
    assert.deepEqual(f.log, [['write', 0x00], ['read', 4]]);
    assert.ok(Math.abs(r.temperature - ((0x612c / 65536) * 165 - 40)) < 1e-9);
    assert.ok(Math.abs(r.humidity - (0x9898 / 65536) * 100) < 1e-9);
    assert.ok(Math.abs(r.temperature - 22.63) < 0.01 && Math.abs(r.humidity - 59.61) < 0.01, 'ours: 22.63 C, 59.61 %');
  });

  it('a NACK while not ready: read again; still none after twice the typical time throws', async () => {
    const r = await new Hdc1080(new FakeHdc({ notReady: 3 })).measure();
    assert.ok(r.humidity > 59);
    await assert.rejects(new Hdc1080(new FakeHdc({ notReady: 1000 })).measure(), /no ack/);
  });

  it('setResolution and setHeater: the configuration written (MODE kept); a wrong resolution throws', async () => {
    const f = new FakeHdc();
    const h = new Hdc1080(f);
    await h.setResolution({ temperature: 11, humidity: 8 });
    assert.equal(await h.config(), 0x1000 | 0x0400 | 0x0200);
    await h.setHeater(true);
    assert.equal(await h.config(), 0x1000 | 0x2000 | 0x0400 | 0x0200);
    await h.setResolution({ humidity: 11 });
    assert.equal(await h.config(), 0x1000 | 0x2000 | 0x0400 | 0x0100);
    await assert.rejects(h.setResolution({ humidity: 12 }), /no humidity resolution 12: 14, 11, 8/);
    await assert.rejects(h.setResolution({ temperature: 8 }), /no temperature resolution 8: 14, 11/);
  });

  it('serialNumber: 0xFB, 0xFC, 0xFD\'s top 9 bits; lowBattery: BTST; periodMs: one a second', async () => {
    const f = new FakeHdc();
    const h = new Hdc1080(f);
    assert.equal(await h.serialNumber(), 0x0279 * 2 ** 25 + 0x9707 * 2 ** 9 + (0x7a80 >> 7));
    assert.equal(await h.lowBattery(), false);
    f.regs[0x02] |= 0x0800;
    assert.equal(await h.lowBattery(), true);
    assert.equal(h.periodMs(), 1000);
  });
});
