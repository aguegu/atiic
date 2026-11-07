// the CH341 on a bench: a CH341 in I2C mode with a known chip on its bus
// (bench.js finds which: an MPU-6050 or MPU-6500, or a BMX055 on r8845).
// That chip's registers are the reference: a block read across packets must
// agree with reading them one by one.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { reference as ref, ADAPTER } from './bench.js';

const ABSENT = 0x2a; // none of the bench's chips answers here

describe('ch341', { skip: ADAPTER !== 'ch341' ? `the bench's adapter is ${ADAPTER}` : ref ? false : 'no known chip on the bench to read registers from' }, () => {
  let bus;
  before(async () => {
    bus = await openCh341();
    await bus.write(ref.address, ref.wake); // asleep, a chip may ignore writes
  });

  after(async () => {
    await bus?.close();
  });

  it(`scans: the ${ref?.Driver.chip.name} among the addresses that answer`, async () => {
    assert.ok((await bus.scan()).includes(ref.address));
  });

  it('a missing device throws, and the bus works after', async () => {
    let err;
    try {
      await bus.writeRead(ABSENT, [0x00], 40);
    } catch (e) {
      err = e;
    }
    assert.equal(err?.message, `no ack from 0x${ABSENT.toString(16)}`);
    assert.equal(await bus.acks(ref.address), true);
  });

  it('a block read across packets agrees with byte reads', async () => {
    const n = ref.staticLast - ref.staticFirst + 1;
    const block = await bus.writeRead(ref.address, [ref.staticFirst], n);
    const single = [];
    for (let r = ref.staticFirst; r <= ref.staticLast; r++) {
      single.push((await bus.writeRead(ref.address, [r], 1))[0]);
    }
    assert.deepEqual(Array.from(block), single);
  });

  it('writes, read back', async () => {
    const [was] = await bus.writeRead(ref.address, [ref.writable], 1);
    for (const v of [...ref.values, was]) {
      await bus.write(ref.address, [ref.writable, v]);
      assert.equal((await bus.writeRead(ref.address, [ref.writable], 1))[0], v);
    }
  });
});
