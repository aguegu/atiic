// the BMX055 magnetometer's driver against a fake one: the trims, the data
// layout and Bosch's compensation, on numbers worked by hand
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Mag } from '../../src/index.js';
import { parseTrim, parseData, compensateXY, compensateZ } from '../../src/devices/bmx055-mag.js';

const ADDRESS = 0x13;
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

class FakeBmx055Mag {
  constructor(chipId = 0x32) {
    this.regs = new Uint8Array(0x80);
    this.chipId = chipId;
    this.writes = [];
  }

  async write(address, bytes) {
    assert.equal(address, ADDRESS);
    this.writes.push(Array.from(bytes));
    const [reg, ...values] = bytes;
    values.forEach((v, i) => { this.regs[reg + i] = v; });
  }

  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    const out = this.regs.slice(reg, reg + n);
    // the chip ID reads 0x00 suspended, its own once the power bit is set
    if (reg <= 0x40 && reg + n > 0x40) out[0x40 - reg] = this.regs[0x4b] & 1 ? this.chipId : 0;
    return out;
  }

  // neutral trims (the compensation reduced to hand arithmetic), with x1 = -10
  setTrims() {
    const t = { 0x5d: 0xf6 /* x1 -10 */, 0x5e: 0, 0x62: 0, 0x63: 0, 0x64: 0, 0x65: 0,
      0x68: 0x00, 0x69: 0x04 /* z2 1024 */, 0x6a: 0x00, 0x6b: 0x20 /* z1 8192 */,
      0x6c: 0x00, 0x6d: 0x90 /* xyz1 0x1000: the top bit masked off */, 0x6e: 0, 0x6f: 0, 0x70: 0, 0x71: 0 };
    for (const [r, v] of Object.entries(t)) this.regs[r] = v;
  }

  // raw x 160, y -160, z 50, Hall resistance 4096 (= xyz1, so r = 0)
  setData() {
    [0x00, 0x05, 0x00, 0xfb, 100, 0x00, 0x00, 64].forEach((v, i) => { this.regs[0x42 + i] = v; });
  }
}

class Quick extends Bmx055Mag {
  static chip = { ...Bmx055Mag.chip, settleMs: 0 };
}

describe('bmx055 magnetometer (host)', () => {
  let bus, mag;
  beforeEach(() => {
    bus = new FakeBmx055Mag();
    bus.setTrims();
    bus.setData();
    mag = new Quick(bus, ADDRESS);
  });

  it('the data unpacked: 13, 13 and 15 bits signed, the Hall resistance 14 unsigned', () => {
    assert.deepEqual(parseData(Uint8Array.of(0x00, 0x05, 0x00, 0xfb, 100, 0x00, 0x00, 64)), { x: 160, y: -160, z: 50, rhall: 4096 });
    assert.deepEqual(parseData(Uint8Array.of(0xf8, 0xff, 0x08, 0x00, 0xfe, 0xff, 0xfc, 0xff)), { x: -1, y: 1, z: -1, rhall: 16383 });
  });

  it('the trims read as the API does: signed bytes, 16-bit words, xyz1\'s top bit masked', () => {
    const t = parseTrim(bus.regs.slice(0x5d, 0x72));
    assert.equal(t.x1, -10);
    assert.equal(t.z2, 1024);
    assert.equal(t.z1, 8192);
    assert.equal(t.xyz1, 0x1000);
  });

  it('compensation, worked by hand with neutral trims: raw x 160 is 160 x 0.3125 = 50 uT, less 5 for x1 -10', () => {
    const t = parseTrim(bus.regs.slice(0x5d, 0x72));
    near(compensateXY(160, 4096, t, t.x1, t.x2), 50 - 5, 'x'); // ((160 x 256 x 160 / 8192) - 80) / 16
    near(compensateXY(-160, 4096, t, t.y1, t.y2), -50, 'y');
    near(compensateZ(50, 4096, t), 50, 'z'); // 50 x 131072 / ((1024 + 8192 x 4096 / 32768) x 4) / 16
  });

  it('an overflowed axis, or no Hall resistance, is null, not 0', () => {
    const t = parseTrim(bus.regs.slice(0x5d, 0x72));
    assert.equal(compensateXY(-4096, 4096, t, t.x1, t.x2), null);
    assert.equal(compensateZ(-16384, 4096, t), null);
    assert.equal(compensateXY(160, 0, t, t.x1, t.x2), null);
  });

  it('init: powered before the chip ID; the regular preset; normal at 10 Hz; measure in uT', async () => {
    await mag.init();
    assert.deepEqual(bus.writes, [
      [0x4b, 0x01], // power: suspend to sleep
      [0x51, 0x04], // REP_XY: nXY 9
      [0x52, 0x0e], // REP_Z: nZ 15
      [0x4c, 0x00], // normal, 10 Hz
    ]);
    const m = (await mag.measure()).magnetometers;
    near(m.x, 45, 'x');
    near(m.y, -50, 'y');
    near(m.z, 50, 'z');
  });

  it('init refuses another chip; sleep suspends', async () => {
    await assert.rejects(new Quick(new FakeBmx055Mag(0x31), ADDRESS).init(), /chip ID 0x31, not a BMX055 magnetometer/);
    await mag.sleep();
    assert.deepEqual(bus.writes.at(-1), [0x4b, 0x00]);
  });
});
