// the CH341's D0-D5 on a bench, seen through a BMX055 whose PS pin is on
// one of them (BENCH_PS): PS low puts it on SPI, gone from the I2C bus;
// high, back. Left high
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Accel, Bmx055Gyro, Bmx055Mag } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { PS, addressOf } from './bench.js';

const CHIPS = [Bmx055Accel, Bmx055Gyro, Bmx055Mag];
const SWITCH_MS = 5; // a margin after PS changes (on r8845 the switch showed at once)
const settle = () => new Promise((resolve) => setTimeout(resolve, SWITCH_MS));

describe('ch341 pins (board)', { skip: PS && addressOf(Bmx055Accel) !== null ? false : 'no BENCH_PS, or no BMX055 found with it' }, () => {
  let bus;
  const addresses = CHIPS.map((D) => addressOf(D)).filter((a) => a !== null);
  before(async () => {
    bus = await openCh341();
  });

  after(async () => {
    await bus?.pins({ [PS]: true });
    await bus?.close();
  });

  it(`${PS} low: the BMX055 on SPI, none of its chips on I2C`, async () => {
    await bus.pins({ [PS]: false });
    await settle();
    for (const a of addresses) assert.equal(await bus.acks(a), false, `0x${a.toString(16)} still answers`);
  });

  it(`${PS} high: all of them back`, async () => {
    await bus.pins({ [PS]: true });
    await settle();
    for (const a of addresses) assert.equal(await bus.acks(a), true, `0x${a.toString(16)} gone`);
  });
});
