// an AGR12 / AGN12 / AGP12 on a bench, named by BENCH_AGR12 (its address,
// 0x50; nothing to look for: src/devices/agr12.js), the bus at 20 kHz (its
// limit is 30 kHz; the CH341's and CH347's slowest), its port open to the room
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Agr12 } from '../../src/index.js';
import { AGR12, openBus } from './bench.js';

const SCL_HZ = 20000;
const ROOM_KPA = 2; // a gauge reading of the room's own air: about 0
const AGREE_KPA = 0.3; // readings a second apart, at rest
const N = 10;

describe('agr12 (board)', { skip: AGR12 === null ? 'no BENCH_AGR12: no AGR12 named on the bench' : false }, () => {
  let bus, s;
  before(async () => {
    bus = await openBus(SCL_HZ);
    if (!(await bus.acks(AGR12))) throw new Error(`BENCH_AGR12 names 0x${AGR12.toString(16)}, but nothing answers there`);
    s = new Agr12(bus, AGR12);
  });

  after(async () => {
    await bus?.close();
  });

  it(`${N} readings of the room: each checked, near 0 kPa (gauge), agreeing`, async (t) => {
    const r = [];
    for (let i = 0; i < N; i++) r.push(await s.pressure());
    t.diagnostic(`kPa: ${r.join(' ')}`);
    for (const p of r) assert.ok(Math.abs(p) < ROOM_KPA, `${p} kPa`);
    assert.ok(Math.max(...r) - Math.min(...r) <= AGREE_KPA, r.join(' '));
  });

  it('read alone, without the command: 0xFF 0xFF 0xFF (why it has no identify())', async () => {
    assert.deepEqual([...await bus.read(AGR12, 3)], [0xff, 0xff, 0xff]);
  });

  it('a result reads once: a second read gives 0xFF 0xFF 0xFF, which the check refuses', async () => {
    await bus.write(AGR12, [0xac, 0x12]);
    await new Promise((r) => setTimeout(r, 80));
    const first = [...await bus.read(AGR12, 3)];
    assert.equal(first[0] ^ first[1], first[2], `first: ${first}`);
    assert.deepEqual([...await bus.read(AGR12, 3)], [0xff, 0xff, 0xff]);
    assert.ok(Math.abs(await s.pressure()) < ROOM_KPA); // the next measurement fine
  });
});
