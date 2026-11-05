// the MLX90614 driver against a fake sensor: words with their PEC
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Mlx90614 } from '../../src/index.js';
import { pec } from '../../src/devices/mlx90614.js';

class FakeMlx {
  constructor(words) { this.words = words; this.bad = false; }
  async writeRead(address, [cmd]) {
    const v = this.words[cmd] ?? 0;
    const lo = v & 0xff, hi = v >> 8;
    const p = pec([address << 1, cmd, (address << 1) | 1, lo, hi]) ^ (this.bad ? 1 : 0);
    return Uint8Array.of(lo, hi, p);
  }
}

describe('mlx90614 (host)', () => {
  it('pec: the datasheet\'s examples (Figure 6: 0x30; Figure 7: 0x48)', () => {
    assert.equal(pec([0xb4, 0x07, 0xb5, 0xd2, 0x3a]), 0x30);
    assert.equal(pec([0xb4, 0x22, 0x07, 0xc8]), 0x48);
  });

  it('measure: Ta and Tobj1 at 0.02 K a count, zone 1 alone whatever the config says', async () => {
    const m = new Mlx90614(new FakeMlx({ 0x25: 0xaff4, 0x06: 0x3ad2, 0x07: 0x3a86 })); // r8845's config: bit 6 set on a BAA
    await m.init();
    assert.equal(m.config, 0xaff4);
    const r = await m.measure();
    assert.ok(Math.abs(r.ambient - (0x3ad2 * 0.02 - 273.15)) < 1e-9);
    assert.ok(Math.abs(r.object - 26.49) < 0.01);
    assert.deepEqual(Object.keys(r), ['ambient', 'object']);
  });

  it('object(2): Tobj2 (0x08), for a part known to be dual', async () => {
    const m = new Mlx90614(new FakeMlx({ 0x08: 0x3a90 }));
    assert.ok(Math.abs(await m.object(2) - (0x3a90 * 0.02 - 273.15)) < 1e-9);
  });

  it('a wrong PEC throws; the error flag throws', async () => {
    const chip = new FakeMlx({ 0x25: 0x9fb4, 0x06: 0x3ad2, 0x07: 0x8000 });
    const m = new Mlx90614(chip);
    await m.init();
    await assert.rejects(m.object(), /flags an error/);
    chip.bad = true;
    await assert.rejects(m.ambient(), /PEC/);
  });

  it('chip.identify: its config word\'s PEC', async () => {
    assert.equal(await Mlx90614.chip.identify(new FakeMlx({ 0x25: 0x9fb4 }), 0x5a), true);
    const bad = new FakeMlx({});
    bad.bad = true;
    assert.equal(await Mlx90614.chip.identify(bad, 0x5a), false);
  });
});
