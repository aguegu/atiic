// the QMC5883L driver against a fake chip: its set-up, the seven bytes (LSB
// first), saturation as null, the two ranges' scales, DRDY waited for
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Qmc5883l } from '../../src/index.js';
import { parseData } from '../../src/devices/qmc5883l.js';

const le = (v) => [v & 0xff, (v >> 8) & 0xff];

class FakeQmc {
  constructor({ x = 0, y = 0, z = 0, status = 0x01, temperature = 341, readyAfter = 0 } = {}) {
    Object.assign(this, { x, y, z, status, temperature, readyAfter });
    this.log = [];
    this.regs = { 0x0d: 0xff };
  }
  async write(address, bytes) {
    this.log.push(['write', ...bytes]);
    this.regs[bytes[0]] = bytes[1];
  }
  async writeRead(address, bytes, n) {
    const r = bytes[0];
    if (r === 0x00) return Uint8Array.of(...le(this.x), ...le(this.y), ...le(this.z), this.status);
    if (r === 0x06) return Uint8Array.of(this.readyAfter-- > 0 ? 0 : this.status);
    if (r === 0x07) return Uint8Array.of(...le(this.temperature));
    return Uint8Array.of(this.regs[r] ?? 0).slice(0, n);
  }
}

describe('qmc5883l (host)', () => {
  it('parseData: LSB first, signed; -32768 and 32767 (saturated) null; DRDY and OVL', () => {
    const d = Uint8Array.of(...le(0x2625), ...le(-2000 & 0xffff), ...le(0x8000), 0x03);
    assert.deepEqual(parseData(d), { x: 0x2625, y: -2000, z: null, ready: true, overflow: true });
    assert.equal(parseData(Uint8Array.of(0xff, 0x7f, 0, 0, 0, 0, 0)).x, null);
  });

  it('init: a soft reset, the set/reset period 0x01, then OSR 512 / range / rate / continuous; DRDY waited for', async () => {
    const f = new FakeQmc({ readyAfter: 1 });
    await new Qmc5883l(f).init();
    assert.deepEqual(f.log, [['write', 0x0a, 0x80], ['write', 0x0b, 0x01], ['write', 0x09, 0x15]]); // 8G 0x10, 50 Hz 0x04, continuous 0x01
    const g = new FakeQmc();
    await new Qmc5883l(g, 0x0d, { range: '2G', rate: 200 }).init();
    assert.deepEqual(g.log.at(-1), ['write', 0x09, 0x0d]); // the datasheet's 0x1D but at 2G: 2G 0x00, 200 Hz 0x0C, continuous
  });

  it('init throws if no data comes ready', async () => {
    await assert.rejects(new Qmc5883l(new FakeQmc({ readyAfter: 99 }), 0x0d, { rate: 200 }).init(), /no data ready/);
  });

  it('measure: microtesla, 3000 LSB/G at 8G and 12000 at 2G (Table 2); a saturated axis null', async () => {
    const m8 = (await new Qmc5883l(new FakeQmc({ x: 3000, y: -1500, z: 0 })).measure()).magnetometers;
    assert.deepEqual(m8, { x: 100, y: -50, z: 0 });
    const m2 = (await new Qmc5883l(new FakeQmc({ x: 12000, y: 6000, z: -32768 }), 0x0d, { range: '2G' }).measure()).magnetometers;
    assert.deepEqual(m2, { x: 100, y: 50, z: null });
  });

  it('temperature: relative, 100 LSB/C', async () => {
    assert.equal(await new Qmc5883l(new FakeQmc({ temperature: 341 })).temperature(), 3.41);
  });

  it('identify: 0xFF at 0x0D; else, or a refusal, no', async () => {
    assert.equal(await Qmc5883l.chip.identify(new FakeQmc(), 0x0d), true);
    const other = new FakeQmc();
    other.regs[0x0d] = 0x00;
    assert.equal(await Qmc5883l.chip.identify(other, 0x0d), false);
    assert.equal(await Qmc5883l.chip.identify({ writeRead: async () => { throw new Error('no ack from 0xd'); } }, 0x0d), false);
  });

  it('a range or rate it hasn\'t throws', () => {
    assert.throws(() => new Qmc5883l(new FakeQmc(), 0x0d, { range: '4G' }), /no range 4G: 2G, 8G/);
    assert.throws(() => new Qmc5883l(new FakeQmc(), 0x0d, { rate: 75 }), /no rate 75 Hz: 10, 50, 100, 200/);
  });
});
