// the AGR12 driver against a fake sensor built from its manual: the command,
// the wait, the check byte, the signed 0.1 kPa count
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Agr12 } from '../../src/index.js';
import { MEASURE_MS } from '../../src/devices/agr12.js';

// the sensor as the manual and r8845's AGP12 say: 0xAC 0x12 starts a
// measurement (ready within MEASURE_MS); its result reads once; a read with
// none ready gives 0xFF 0xFF 0xFF
class FakeAgr {
  constructor(count) { this.count = count; this.log = []; this.started = null; }
  async write(address, bytes) {
    this.log.push(['write', address, ...bytes]);
    this.started = bytes[0] === 0xac && bytes[1] === 0x12 ? Date.now() : null;
  }
  async read(address, n) {
    this.log.push(['read', address, n]);
    if (this.started === null) return Uint8Array.of(0xff, 0xff, 0xff);
    this.started = null; // read once
    const hi = (this.count >> 8) & 0xff, lo = this.count & 0xff;
    return Uint8Array.of(hi, lo, hi ^ lo);
  }
}

describe('agr12 (host)', () => {
  it('measure: 0xAC 0x12 to 0x50, then 3 bytes, MEASURE_MS (80) later', async () => {
    const s = new FakeAgr(0x0123);
    const t0 = Date.now();
    const r = await new Agr12(s).measure();
    assert.ok(Date.now() - t0 >= MEASURE_MS, `${Date.now() - t0} ms`);
    assert.deepEqual(s.log, [['write', 0x50, 0xac, 0x12], ['read', 0x50, 3]]);
    assert.equal(r.pressure, 29.1); // the manual's example: 0x0123 = 291
  });

  it('negative: 0xFEDD is -29.1 kPa (the manual\'s second example), 0xFFFF -0.1', async () => {
    assert.equal(await new Agr12(new FakeAgr(0xfedd)).pressure(), -29.1);
    assert.equal(await new Agr12(new FakeAgr(0xffff)).pressure(), -0.1);
  });

  it('a bad check byte throws', async () => {
    const s = new FakeAgr(0x0123);
    s.read = async () => Uint8Array.of(0x01, 0x23, 0x00);
    await assert.rejects(new Agr12(s).pressure(), /AGR12 check/);
  });

  it('nothing measured (0xFF 0xFF 0xFF, as before a command or from an erased EEPROM) fails the check', async () => {
    const s = new FakeAgr(0x0123);
    s.read = async () => Uint8Array.of(0xff, 0xff, 0xff);
    await assert.rejects(new Agr12(s).pressure(), /AGR12 check: 0xff for 0xff 0xff/);
  });

  it('a result reads once: a second read with no new command is refused', async () => {
    const s = new FakeAgr(0x0123);
    const a = new Agr12(s);
    assert.equal(await a.pressure(), 29.1);
    s.write = async () => {}; // no new command
    await assert.rejects(a.pressure(), /AGR12 check/);
  });

  it('another address', async () => {
    const s = new FakeAgr(0);
    await new Agr12(s, 0x51).pressure();
    assert.equal(s.log[0][1], 0x51);
  });

  it('no identify(): never looked for (the command writes to an EEPROM at 0x50); 30 kHz at most', () => {
    assert.equal(Agr12.chip.identify, undefined);
    assert.equal(Agr12.chip.maxSclHz, 30000);
    assert.deepEqual(Agr12.addresses, [0x50]);
  });
});
