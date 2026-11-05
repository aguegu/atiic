// the HMC5883L's driver against a fake one: its set-up, the X Z Y data
// order, the scale, overflow and the self test's limits
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hmc5883l } from '../../src/index.js';
import { parseData } from '../../src/devices/hmc5883l.js';

const ADDRESS = 0x1e;
const be = (v) => [(v >> 8) & 0xff, v & 0xff];

// registers 0x00-0x0C; the data the test sets, per CRA's bias bits
class FakeHmc5883l {
  constructor({ id = [0x48, 0x34, 0x33], normal = [0, 0, 0], positive = [0, 0, 0], negative = [0, 0, 0] } = {}) {
    this.regs = new Uint8Array(13);
    this.regs.set([0x10, 0x20, 0x01]); // the defaults
    this.regs.set(id, 0x0a);
    this.data = { 0: normal, 1: positive, 2: negative };
    this.writes = [];
  }

  async write(address, [reg, ...values]) {
    assert.equal(address, ADDRESS);
    this.writes.push([reg, ...values]);
    values.forEach((v, i) => { this.regs[reg + i] = v; });
  }

  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    const [x, y, z] = this.data[this.regs[0] & 0x03];
    this.regs.set([...be(x), ...be(z), ...be(y)], 0x03);
    return this.regs.slice(reg, reg + n);
  }
}


describe('hmc5883l (host)', () => {
  it('parses X, Z, Y in that order, signed, -4096 as overflow', () => {
    assert.deepEqual(parseData([...be(100), ...be(-300 & 0xffff), ...be(-2048 & 0xffff)]), { x: 100, y: -2048, z: -300 });
    assert.deepEqual(parseData([...be(-4096 & 0xffff), ...be(5), ...be(2047)]), { x: null, y: 2047, z: 5 });
  });

  it('knows the chip by "H43" and refuses another', async () => {
    assert.equal(await Hmc5883l.chip.identify(new FakeHmc5883l(), ADDRESS), true);
    assert.equal(await Hmc5883l.chip.identify(new FakeHmc5883l({ id: [0, 0, 0] }), ADDRESS), false);
    await assert.rejects(new Hmc5883l(new FakeHmc5883l({ id: [0x48, 0x34, 0x00] })).init(), /H43/);
  });

  it('sets up the datasheet\'s continuous mode: CRA 0x70, CRB 0x20, mode 0x00', async () => {
    const bus = new FakeHmc5883l();
    await new Hmc5883l(bus).init();
    assert.deepEqual(bus.writes, [[0x00, 0x70, 0x20, 0x00]]);
  });

  it('scales by 1090 LSb/gauss into microtesla', async () => {
    const m = new Hmc5883l(new FakeHmc5883l({ normal: [1090, -545, 218] }));
    const { magnetometers } = await m.measure();
    assert.deepEqual(magnetometers, { x: 100, y: -50, z: 20 });
  });

  it('passes a self test within 243-575 (and the negative mirror), writing the set-up back', async () => {
    const bus = new FakeHmc5883l({ positive: [452, 452, 421], negative: [-452, -452, -421] });
    const r = await new Hmc5883l(bus).selfTest();
    assert.equal(r.pass, true);
    assert.deepEqual(r.positive, { x: 452, y: 452, z: 421 });
    assert.deepEqual(bus.writes.at(-1), [0x00, 0x70, 0x20, 0x00]);
  });

  it('fails a self test with an axis out of range', async () => {
    const bus = new FakeHmc5883l({ positive: [452, 100, 421], negative: [-452, -452, -421] });
    assert.equal((await new Hmc5883l(bus).selfTest()).pass, false);
  });

  it('idles on sleep()', async () => {
    const bus = new FakeHmc5883l();
    await new Hmc5883l(bus).sleep();
    assert.deepEqual(bus.writes, [[0x02, 0x02]]);
  });
});
