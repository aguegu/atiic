// the CH341 on a bench: a CH341 in I2C mode with an MPU-6050 at 0x68 on its
// bus (r8845). Its registers are the reference: a block read across
// packets must agree with reading them one by one.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openCh341 } from '../../src/adapters/ch341/node.js';

const MPU = 0x68;
const ABSENT = 0x10; // nothing on the bench answers here
const REG_SMPLRT_DIV = 0x19;
const REG_PWR_MGMT_1 = 0x6b;
const PWR_AWAKE = 0x00; // asleep, the MPU-6050 ignores writes to its other registers
const STATIC_FIRST = 0x0d; // SELF_TEST_X .. INT_ENABLE: no sensor data among them
const STATIC_LAST = 0x39; // INT_STATUS (0x3a) after it clears on read

let bus;

describe('ch341', () => {
  before(async () => {
    bus = await openCh341();
    await bus.write(MPU, [REG_PWR_MGMT_1, PWR_AWAKE]);
  });

  after(async () => {
    await bus?.close();
  });

  it('scans: the MPU-6050 and nothing else', async () => {
    assert.deepEqual(await bus.scan(), [MPU]);
  });

  it('a missing device throws, and the bus works after', async () => {
    let err;
    try {
      await bus.writeRead(ABSENT, [0x00], 40);
    } catch (e) {
      err = e;
    }
    assert.equal(err?.message, 'no ack from 0x10');
    assert.equal(await bus.acks(MPU), true);
  });

  it('a block read across packets agrees with byte reads', async () => {
    const n = STATIC_LAST - STATIC_FIRST + 1;
    const block = await bus.writeRead(MPU, [STATIC_FIRST], n);
    const single = [];
    for (let r = STATIC_FIRST; r <= STATIC_LAST; r++) {
      single.push((await bus.writeRead(MPU, [r], 1))[0]);
    }
    assert.deepEqual(Array.from(block), single);
  });

  it('writes, read back', async () => {
    const [was] = await bus.writeRead(MPU, [REG_SMPLRT_DIV], 1);
    for (const v of [0x5a, 0xa5, was]) {
      await bus.write(MPU, [REG_SMPLRT_DIV, v]);
      assert.equal((await bus.writeRead(MPU, [REG_SMPLRT_DIV], 1))[0], v);
    }
  });
});
