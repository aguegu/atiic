// an AGS2602 on the bench (found by its version's CRC: bench.js), read at
// the CH341's and CH347's slowest (20 kHz) and its own top (100 kHz). Its
// supply is 5 V; it may still be warming up (RDY set), which these accept
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { Ags2602 } from '../../src/index.js';
import { MAX_SCL_HZ } from '../../src/devices/ags2602.js';
import { addressOf, onlyWith, openBus } from './bench.js';

const RANGE_PPB = 30000; // the manual, Table 1: 0-30000 ppb
const N = 5;

for (const hz of [20000, MAX_SCL_HZ]) {
  describe(`ags2602 (board, ${hz / 1000} kHz)`, onlyWith(Ags2602), () => {
    let bus;
    const open = async () => {
      bus ??= await openBus(hz);
      return new Ags2602(bus, addressOf(Ags2602));
    };
    after(async () => {
      await bus?.close();
    });

    it('version: four bytes, its CRC good', async (t) => {
      const v = await (await open()).version();
      t.diagnostic(v.map((b) => b.toString(16).padStart(2, '0')).join(' '));
      assert.equal(v.length, 4);
    });

    it('resistance: a CRC-checked count, ohms', async (t) => {
      const r = await (await open()).resistance();
      t.diagnostic(`${r} ohm`);
      assert.ok(r > 0, `${r}`);
    });

    it(`${N} concentrations, each CRC-checked, within 0-${RANGE_PPB} ppb`, async (t) => {
      const s = await open();
      const r = [];
      for (let i = 0; i < N; i++) r.push(await s.measure());
      t.diagnostic(r.map((m) => `${m.tvoc}${m.ready ? '' : ' (not ready)'}`).join(' '));
      for (const m of r) assert.ok(m.tvoc >= 0 && m.tvoc <= RANGE_PPB, `${m.tvoc}`);
    });
  });
}
