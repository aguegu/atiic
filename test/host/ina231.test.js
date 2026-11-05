// the INA231 driver against a fake chip: the datasheet's example (Table 8-1)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ina231 } from '../../src/index.js';

class FakeIna {
  constructor(regs) { this.regs = regs; this.writes = []; }
  async write(address, [reg, h, l]) { this.writes.push([reg, (h << 8) | l]); }
  async writeRead(address, [reg]) { const v = this.regs[reg] ?? 0; return Uint8Array.of(v >> 8, v & 0xff); }
}

describe('ina231 (host)', () => {
  it('init: reset, the continuous configuration, CAL (0.1 ohm, 0.1 mA: 512)', async () => {
    const chip = new FakeIna({});
    await new Ina231(chip).init();
    assert.deepEqual(chip.writes, [[0x00, 0x8000], [0x00, 0x4127], [0x05, 512]]);
  });

  it('the datasheet\'s example: 2 mohm, 1 mA a count: CAL 2560; 20 mV, 11.98 V, 10 A, 119.8 W', async () => {
    const chip = new FakeIna({ 0x01: 0x1f40, 0x02: 0x2570, 0x04: 0x2710, 0x03: 0x12b8 });
    const ina = new Ina231(chip, 0x40, { shunt: 0.002, currentLsb: 0.001 });
    assert.equal(ina.calibration, 2560);
    const r = await ina.measure();
    assert.ok(Math.abs(r.shunt - 0.02) < 1e-9 && Math.abs(r.bus - 11.98) < 1e-9);
    assert.ok(Math.abs(r.current - 10) < 1e-9 && Math.abs(r.power - 119.8) < 1e-9);
  });

  it('shunt and current signed: a reverse current reads negative', async () => {
    const r = await new Ina231(new FakeIna({ 0x01: 0xfe0c, 0x04: 0xff9c })).measure(); // -500 and -100 counts
    assert.ok(Math.abs(r.shunt - -0.00125) < 1e-12);
    assert.ok(Math.abs(r.current - -0.01) < 1e-12);
  });

  it('a calibration out of range throws', () => {
    assert.throws(() => new Ina231(new FakeIna({}), 0x40, { shunt: 1, currentLsb: 1 }), /out of range/);
  });

  it('chip.identify: TI\'s ID at FEh', async () => {
    assert.equal(await Ina231.chip.identify(new FakeIna({ 0xfe: 0x5449 }), 0x40), true);
    assert.equal(await Ina231.chip.identify(new FakeIna({ 0xfe: 0x0000 }), 0x40), false);
  });
});
