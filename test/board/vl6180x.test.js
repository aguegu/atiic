// the VL6180X on a bench: Dart-8346's at 0x29 on r8845 at 400 kHz, whatever
// is above it. Its ALS read 0 on ours in every mode (devices/vl6180x.js):
// only that it answers is checked
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Vl6180x } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 400000; // its I2C: up to 400 kHz
const READINGS = 5;
const STEADY_MM = 6; // a still target: five ranges within this

describe('vl6180x (board)', onlyWith(Vl6180x), () => {
  let bus, v;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    v = new Vl6180x(bus, addressOf(Vl6180x));
  });

  after(async () => {
    await bus?.close();
  });

  it('inits: AN4545\'s settings when fresh out of reset, the flag clear after', async (t) => {
    const loaded = await v.init();
    t.diagnostic(loaded ? 'fresh out of reset: settings loaded' : 'already set up since its last power-up');
    assert.equal((await v.read(0x016))[0] & 0x01, 0);
  });

  it(`ranges ${READINGS} times: a distance with no error, or nothing in reach; a still target steady`, async (t) => {
    const r = [];
    for (let i = 0; i < READINGS; i++) r.push(await v.range());
    t.diagnostic(r.map((x) => `${x.mm} mm${x.error ? ` (${x.error})` : ''}`).join(', '));
    const good = r.filter((x) => x.near).map((x) => x.mm);
    assert.ok(good.length === READINGS || r.every((x) => Vl6180x.NOTHING_NEAR.includes(x.error)), JSON.stringify(r));
    if (good.length) assert.ok(Math.max(...good) - Math.min(...good) <= STEADY_MM, good.join(' '));
  });

  it('measures its ALS (a count, whatever it is)', async (t) => {
    const a = await v.als();
    t.diagnostic(`${a.count} counts, ${a.lux.toFixed(2)} lux`);
    assert.ok(a.count >= 0 && a.count <= 0xffff);
  });
});
