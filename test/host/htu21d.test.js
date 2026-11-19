// the HTU21D driver against a fake sensor: an SHT20's commands and
// formulas, its own waits and name, told from an SHT20 by its electronic ID
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Htu21d, Sht20 } from '../../src/index.js';
import { crc8 } from '../../src/devices/sht20.js';

// an electronic ID's second read: two words, each with its CRC
const idRead = (w1, w2) => Uint8Array.of(w1 >> 8, w1 & 0xff, crc8([w1 >> 8, w1 & 0xff]), w2 >> 8, w2 & 0xff, crc8([w2 >> 8, w2 & 0xff]));
const OURS = idRead(0x3211, 0x4854); // Dart-8346's HTU21D: "HT"
const R8845_SHT20 = idRead(0x0151, 0x0080);

class FakeHtu {
  constructor(t, rh, id = OURS) { this.t = t; this.rh = rh; this.id = id; this.log = []; this.next = null; }
  async write(address, bytes) { this.log.push(['write', ...bytes]); this.next = bytes[0]; }
  async read(address, n) {
    this.log.push(['read', n]);
    const [hi, lo] = this.next === 0xf3 ? this.t : this.rh;
    return Uint8Array.of(hi, lo, crc8([hi, lo]));
  }
  async writeRead(address, bytes) {
    if (bytes[0] === 0xfc) return this.id;
    return Uint8Array.of(0x02); // its user register's default
  }
}

describe('htu21d (host)', () => {
  it('the datasheet\'s CRC examples (p. 15): 0xDC -> 0x79, 0x683A -> 0x7C, 0x4E85 -> 0x6B', () => {
    assert.equal(crc8([0xdc]), 0x79);
    assert.equal(crc8([0x68, 0x3a]), 0x7c);
    assert.equal(crc8([0x4e, 0x85]), 0x6b);
  });

  it('measure: the SHT20\'s commands and formulas; the datasheet\'s 0x7C80 is 54.8 % (p. 15)', async () => {
    const f = new FakeHtu([0x68, 0x38], [0x7c, 0x82]); // RH status 10
    const r = await new Htu21d(f).measure();
    assert.deepEqual(f.log, [['write', 0xf3], ['read', 3], ['write', 0xf5], ['read', 3]]);
    assert.ok(Math.abs(r.humidity - 54.8) < 0.05, `${r.humidity}`);
    assert.ok(Math.abs(r.temperature - 24.7) < 0.05, `${r.temperature}`); // 0x6838: p. 15's 0x683A, 24.7 C, its status bits cleared (a temperature)
  });

  it('its own waits (the datasheet\'s maxima): 66 ms at 12/14 bits, 15 at 11/11; the period follows', async () => {
    const s = new Htu21d(new FakeHtu([0x68, 0x38], [0x7c, 0x82]));
    assert.equal(s.periodMs(), 660);
    let t0 = Date.now();
    await s.measure();
    let ms = Date.now() - t0;
    assert.ok(ms >= 66 && ms < 110, `12/14: ${ms} ms (an SHT20 waits 114)`);
    await s.setResolution('11/11');
    assert.equal(s.periodMs(), 150);
    t0 = Date.now();
    await s.measure();
    ms = Date.now() - t0;
    assert.ok(ms >= 15 && ms < 60, `11/11: ${ms} ms`);
    assert.equal(Htu21d.STRETCH_MS, 60);
  });

  it('its name in the errors', async () => {
    const f = new FakeHtu([0x68, 0x38], [0x7c, 0x82]);
    f.read = async () => Uint8Array.of(0x68, 0x38, 0x00);
    await assert.rejects(new Htu21d(f).temperature(), /^Error: HTU21D CRC/);
    await assert.rejects(new Htu21d(f).setResolution('9/9'), /HTU21D: no resolution 9\/9/);
  });

  it('identify: an HTU21D says "HT", an SHT20 doesn\'t; each driver takes only its own', async () => {
    assert.equal(await Htu21d.chip.identify(new FakeHtu(), 0x40), true);
    assert.equal(await Sht20.chip.identify(new FakeHtu(), 0x40), false);
    const sht = new FakeHtu(null, null, R8845_SHT20);
    assert.equal(await Htu21d.chip.identify(sht, 0x40), false);
    assert.equal(await Sht20.chip.identify(sht, 0x40), true);
    const bad = new FakeHtu(null, null, Uint8Array.of(0x48, 0x54, 0x00, 0x48, 0x54, 0x00));
    assert.equal(await Htu21d.chip.identify(bad, 0x40), false);
  });
});
