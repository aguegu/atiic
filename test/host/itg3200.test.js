// the ITG-3200's driver against a fake one: telling it from an MPU, its
// set-up, the data layout, deg/s and the temperature
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Itg3200 } from '../../src/index.js';
import { parseData, celsius } from '../../src/devices/itg3200.js';

const ADDRESS = 0x68;
const be = (v) => [(v >> 8) & 0xff, v & 0xff];

class FakeItg3200 {
  constructor({ whoAmI = 0x69, at75 = 0x00, data = [0, 0, 0, 0] } = {}) {
    this.regs = new Uint8Array(0x76);
    this.regs[0x00] = whoAmI;
    this.regs[0x75] = at75;
    this.regs.set(data.flatMap((v) => be(v & 0xffff)), 0x1b);
    this.writes = [];
  }

  async write(address, [reg, ...values]) {
    assert.equal(address, ADDRESS);
    this.writes.push([reg, ...values]);
    values.forEach((v, i) => { this.regs[reg + i] = v; });
  }

  // asleep (r8845's part): every register but PWR_MGM reads 0; reset: awake
  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    if (this.regs[0x3e] & 0x80) this.regs[0x3e] = 0;
    const out = this.regs.slice(reg, reg + n);
    if (this.regs[0x3e] & 0x40) out.forEach((_, i) => { if (reg + i !== 0x3e) out[i] = 0; });
    return out;
  }
}

describe('itg3200 (host)', () => {
  it('parses temperature, X, Y, Z, MSB first, signed', () => {
    assert.deepEqual(parseData([...be(-13200 & 0xffff), ...be(144), ...be(-288 & 0xffff), ...be(1)]), { temperature: -13200, x: 144, y: -288, z: 1 });
  });

  it('reads 35 C at -13200 and 280 LSb a degree', () => {
    assert.equal(celsius(-13200), 35);
    assert.equal(celsius(-13200 - 2800), 25);
  });

  it('knows itself by WHO_AM_I (bit 0 either way), and an MPU-6050 or -6500 as not', async () => {
    assert.equal(await Itg3200.chip.identify(new FakeItg3200({ whoAmI: 0x69 }), ADDRESS), true);
    assert.equal(await Itg3200.chip.identify(new FakeItg3200({ whoAmI: 0x68 }), ADDRESS), true);
    assert.equal(await Itg3200.chip.identify(new FakeItg3200({ whoAmI: 0x00 }), ADDRESS), false);
    assert.equal(await Itg3200.chip.identify(new FakeItg3200({ whoAmI: 0x68, at75: 0x68 }), ADDRESS), false);
    assert.equal(await Itg3200.chip.identify(new FakeItg3200({ whoAmI: 0x68, at75: 0x70 }), ADDRESS), false);
  });

  it('resets, takes the X gyro\'s PLL, then +/-2000 deg/s, 98 Hz, 1 kHz', async () => {
    const bus = new FakeItg3200();
    await new Itg3200(bus).init();
    assert.deepEqual(bus.writes, [[0x3e, 0x80], [0x3e, 0x01], [0x15, 0x00, 0x1a]]);
  });

  it('inits a chip left asleep (its WHO_AM_I reading 0 till woken)', async () => {
    const bus = new FakeItg3200();
    bus.regs[0x3e] = 0x41;
    await new Itg3200(bus).init();
    assert.deepEqual(bus.writes[0], [0x3e, 0x80]);
  });

  it('refuses another chip', async () => {
    await assert.rejects(new Itg3200(new FakeItg3200({ whoAmI: 0x00 })).init(), /WHO_AM_I 0x0/);
  });

  it('scales by 14.375 LSb per deg/s', async () => {
    const m = await new Itg3200(new FakeItg3200({ data: [-13200, 1437.5 * 2, -14375, 0] })).measure();
    assert.deepEqual(m.gyroscopes, { x: 200, y: -1000, z: 0 });
    assert.equal(m.temperature, 35);
  });

  it('sleeps, keeping its clock', async () => {
    const bus = new FakeItg3200();
    await new Itg3200(bus).sleep();
    assert.deepEqual(bus.writes, [[0x3e, 0x41]]);
  });
});
