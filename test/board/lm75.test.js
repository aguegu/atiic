// the LM75 on a bench: Dart-8346's on r8845 at 100 kHz, a room's air
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Lm75 } from '../../src/index.js';
import { onlyWith, addressOf, sclFor, openBus } from './bench.js';

const SCL_HZ = 100000; // the LM75's I2C: up to 400 kHz; 100 as tried
const AGREE_C = 1; // two readings a second apart, at rest (0.5 C steps)

describe('lm75 (board)', onlyWith(Lm75), () => {
  let bus, t;
  before(async () => {
    bus = await openBus(sclFor(SCL_HZ));
    t = new Lm75(bus, addressOf(Lm75));
  });

  after(async () => {
    await t?.init();
    await bus?.close();
  });

  it('inits: the power-up state back (configuration 0, 75 and 80 C)', async () => {
    await t.init();
    assert.equal(await t.config(), 0x00);
    assert.deepEqual(await t.limits(), { hysteresis: 75, overtemperature: 80 });
  });

  it('measures a room: 5-45 C, on the 0.5 C step', async () => {
    const c = await t.temperature();
    assert.ok(c > 5 && c < 45, `${c} C`);
    assert.equal(c * 2, Math.round(c * 2));
  });

  it('two readings a second apart agree', async () => {
    const a = await t.temperature();
    await new Promise((r) => setTimeout(r, 1000));
    const b = await t.temperature();
    assert.ok(Math.abs(a - b) <= AGREE_C, `${a} then ${b} C`);
  });

  it('read as an LM75A (11 bits): the same air, 0.125 C steps', async (ctx) => {
    const nine = await t.temperature();
    const eleven = await new Lm75(bus, addressOf(Lm75), { bits: 11 }).temperature();
    ctx.diagnostic(`9 bits ${nine} C, 11 bits ${eleven} C`);
    assert.ok(Math.abs(eleven - nine) <= 0.5 + 0.125);
    assert.equal(eleven * 8, Math.round(eleven * 8));
  });

  it('the limits read back, negative too', async () => {
    await t.setLimits({ hysteresis: -10.5, overtemperature: 30 });
    assert.deepEqual(await t.limits(), { hysteresis: -10.5, overtemperature: 30 });
  });

  it('the configuration reads back; shut down it still answers, its last conversion kept', async () => {
    await t.configure({ faultQueue: 4, activeHigh: true, interrupt: true });
    assert.equal(await t.config(), 0x10 | 0x04 | 0x02);
    const before = await t.temperature();
    await t.configure({ shutdown: true });
    assert.equal((await t.config()) & 0x01, 0x01);
    await new Promise((r) => setTimeout(r, 2 * Lm75.CONVERSION_MS));
    assert.ok(Math.abs((await t.temperature()) - before) <= AGREE_C);
    await t.configure({ shutdown: false });
  });
});
