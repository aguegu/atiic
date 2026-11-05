// the CH341's D0-D5 on a bench, seen through a BMX055 whose PS pin is on
// one of them (BENCH_PS): driven high (bench.js does it before anything
// looks for a chip), all three of its chips answer on I2C.
//
// Not tested: PS driven low while it runs. On r8845 that put the BMX055 on
// SPI as expected, but back high only the gyro and the magnetometer
// returned; the accelerometer stayed on SPI until the module was powered
// off and on. The datasheet has PS wired fixed ("a direct electrical
// connection ... to ensure reliable protocol selection"): set it once,
// before the chip is used
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bmx055Accel, Bmx055Gyro, Bmx055Mag } from '../../src/index.js';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { PS, addressOf } from './bench.js';

const CHIPS = [Bmx055Accel, Bmx055Gyro, Bmx055Mag];

describe('ch341 pins (board)', { skip: PS && addressOf(Bmx055Accel) !== null ? false : 'no BENCH_PS, or no BMX055 found with it' }, () => {
  let bus;
  before(async () => {
    bus = await openCh341();
  });

  after(async () => {
    await bus?.close();
  });

  it(`${PS} driven high: all three BMX055 chips on I2C`, async () => {
    await bus.pins({ [PS]: true });
    for (const D of CHIPS) {
      const a = addressOf(D);
      assert.notEqual(a, null, `${D.chip.name} not found by the bench probe`);
      assert.equal(await bus.acks(a), true, `${D.chip.name} at 0x${a.toString(16)} gone`);
    }
  });
});
