// the ADXL345's driver against a fake one: its set-up, the data layout and
// scale, and the self test's arithmetic and limits
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Adxl345 } from '../../src/index.js';
import { parseData, selfTestLimits } from '../../src/devices/adxl345.js';

const ADDRESS = 0x53;
const le = (v) => [v & 0xff, (v >> 8) & 0xff];

// registers 0x00-0x39; the data per DATA_FORMAT's SELF_TEST bit
class FakeAdxl345 {
  constructor({ devid = 0xe5, still = [0, 0, 256], selfTest = [0, 0, 0] } = {}) {
    this.regs = new Uint8Array(0x3a);
    this.regs[0x00] = devid;
    this.regs[0x2c] = 0x0a;
    this.still = still;
    this.shift = selfTest;
    this.writes = [];
  }

  async write(address, [reg, ...values]) {
    assert.equal(address, ADDRESS);
    this.writes.push([reg, ...values]);
    values.forEach((v, i) => { this.regs[reg + i] = v; });
  }

  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    const on = this.regs[0x31] & 0x80;
    const v = this.still.map((s, i) => s + (on ? this.shift[i] : 0));
    this.regs.set([...le(v[0]), ...le(v[1]), ...le(v[2])], 0x32);
    return this.regs.slice(reg, reg + n);
  }
}

describe('adxl345 (host)', () => {
  it('parses X, Y, Z low byte first, signed', () => {
    assert.deepEqual(parseData([...le(256), ...le(-512 & 0xffff), ...le(-1 & 0xffff)]), { x: 256, y: -512, z: -1 });
  });

  it('sets up full resolution, +/-16 g, 100 Hz, then measures', async () => {
    const bus = new FakeAdxl345();
    await new Adxl345(bus).init();
    assert.deepEqual(bus.writes, [[0x2d, 0x00], [0x31, 0x0b], [0x2c, 0x0a], [0x2d, 0x08]]);
  });

  it('refuses another chip', async () => {
    await assert.rejects(new Adxl345(new FakeAdxl345({ devid: 0x00 })).init(), /DEVID 0x0/);
  });

  it('scales by 256 LSb/g', async () => {
    const m = await new Adxl345(new FakeAdxl345({ still: [128, -256, 512] })).measure();
    assert.deepEqual(m.accelerometers, { x: 0.5, y: -1, z: 2 });
  });

  it('scales Table 15\'s limits by Table 14 (3.3 V: 1.77, 1.47)', () => {
    const l = selfTestLimits(3.3);
    assert.deepEqual(l.y, [-540 * 1.77, -50 * 1.77]);
    assert.deepEqual(l.z, [75 * 1.47, 875 * 1.47]);
    assert.throws(() => selfTestLimits(3), /Table 14/);
  });

  it('passes a self test: the change with SELF_TEST on, SELF_TEST cleared after', async () => {
    const bus = new FakeAdxl345({ still: [5, -7, 250], selfTest: [400, -400, 600] });
    const r = await new Adxl345(bus).selfTest();
    assert.deepEqual(r.change, { x: 400, y: -400, z: 600 });
    assert.equal(r.pass, true);
    assert.deepEqual(bus.writes, [[0x31, 0x8b], [0x31, 0x0b]]);
  });

  it('fails a self test with an axis that doesn\'t move', async () => {
    const bus = new FakeAdxl345({ selfTest: [400, 0, 600] });
    assert.equal((await new Adxl345(bus).selfTest()).pass, false);
  });

  it('stands by on sleep()', async () => {
    const bus = new FakeAdxl345();
    await new Adxl345(bus).sleep();
    assert.deepEqual(bus.writes, [[0x2d, 0x00]]);
  });
});
