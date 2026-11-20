// the TCS3472 driver against a fake chip: the command byte (bit 7, the
// auto-increment type), its set-up, AVALID, the four channels LSB first,
// saturation at the integration's full scale, its two IDs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Tcs34725, Vl53l1x } from '../../src/index.js';

class FakeTcs {
  constructor({ id = 0x4d, data = [75, 24, 27, 27], validAfter = 0 } = {}) {
    this.regs = new Uint8Array(32);
    this.regs[0x12] = id;
    this.regs.set(data.flatMap((v) => [v & 0xff, v >> 8]), 0x14);
    this.validAfter = validAfter;
    this.log = [];
  }
  async write(address, [cmd, ...data]) {
    assert.ok(cmd & 0x80, 'a command byte, bit 7 set');
    this.log.push([cmd, ...data]);
    this.regs.set(data, cmd & 0x1f);
  }
  async writeRead(address, [cmd], n) {
    assert.ok(cmd & 0x80, 'a command byte, bit 7 set');
    const reg = cmd & 0x1f;
    if (reg === 0x13) return Uint8Array.of(this.validAfter-- > 0 ? 0 : 0x01);
    if (n > 1) assert.equal(cmd & 0x60, 0x20, 'a burst: auto-increment');
    return this.regs.slice(reg, reg + n);
  }
}

describe('tcs34725 (host)', () => {
  it('init: PON, then ATIME = 256 - steps, AGAIN\'s code, PON|AEN; AVALID waited for', async () => {
    const f = new FakeTcs({ validAfter: 2 });
    const t = new Tcs34725(f, 0x29, { gain: 16, steps: 42 });
    await t.init();
    assert.deepEqual(f.log, [[0x80, 0x01], [0x81, 0xd6], [0x8f, 0x02], [0x80, 0x03]]);
    assert.ok(Math.abs(t.integrationMs - 100.8) < 1e-9);
    assert.throws(() => new Tcs34725(f, 0x29, { gain: 8 }), /no gain 8: 1, 4, 16, 60/);
    assert.throws(() => new Tcs34725(f, 0x29, { steps: 0 }), /steps 1-256/);
  });

  it('measure: clear, red, green, blue from 0x14 in one burst, LSB first', async () => {
    assert.deepEqual(await new Tcs34725(new FakeTcs({ data: [0x1234, 1, 0x0200, 0xffff] })).measure(), { clear: 0x1234, red: 1, green: 0x200, blue: 0xffff, saturated: false });
  });

  it('saturated: clear at (256 - ATIME) x 1024, 65535 at most', async () => {
    assert.equal((await new Tcs34725(new FakeTcs({ data: [1024, 0, 0, 0] }), 0x29, { steps: 1 }).measure()).saturated, true);
    assert.equal((await new Tcs34725(new FakeTcs({ data: [1023, 0, 0, 0] }), 0x29, { steps: 1 }).measure()).saturated, false);
    assert.equal(new Tcs34725(new FakeTcs(), 0x29, { steps: 256 }).fullScale, 65535);
  });

  it('identify and part: 0x44 the TCS34725, 0x4D the TCS34727; another ID or a NACK no', async () => {
    assert.equal(await Tcs34725.chip.identify(new FakeTcs({ id: 0x44 }), 0x29), true);
    assert.equal(await Tcs34725.chip.identify(new FakeTcs({ id: 0x4d }), 0x29), true);
    assert.equal(await new Tcs34725(new FakeTcs({ id: 0x44 })).part(), 'TCS34725');
    assert.equal(await new Tcs34725(new FakeTcs({ id: 0x4d })).part(), 'TCS34727');
    assert.equal(await Tcs34725.chip.identify(new FakeTcs({ id: 0x10 }), 0x29), false);
    assert.equal(await Tcs34725.chip.identify({ async writeRead() { throw new Error('no ack'); } }, 0x29), false);
    assert.equal(Vl53l1x.addresses.includes(0x29) && Tcs34725.addresses.includes(0x29), true);
  });

  it('sleep: ENABLE 0', async () => {
    const f = new FakeTcs();
    await new Tcs34725(f).sleep();
    assert.deepEqual(f.log, [[0x80, 0x00]]);
  });
});
