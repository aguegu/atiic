// a FIFO that overflows while readFifo() waits on a slow link (a Dart over
// Bluetooth: 150 ms a transfer on a BLE 4.0 Mac, 2026-11-12): the FIFO counted,
// then filled past its size before its bytes were read, the chip overwriting
// the oldest; the driver must say so, not hand out what's left as if whole
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050, Mpu6500 } from '../../src/index.js';
import FakeMpu from './fake-mpu.js';

const REG_INT_STATUS = 0x3a;
const RATE = 250; // Hz: startFifo({ divider: 3 }) with the filter on
const FRAME = 12; // accelerometers and gyroscopes

// a driver on a fake chip of its FIFO size, its clock the fake's, the FIFO
// started at 250 Hz and the chip producing
async function streaming(Chip, whoAmI, fifoSize, latency) {
  const bus = new FakeMpu(whoAmI, { fifoSize });
  const mpu = new Chip(bus);
  mpu.now = () => bus.time;
  await mpu.init();
  await mpu.startFifo({ divider: 3 });
  bus.latency = latency;
  bus.produce(RATE, FRAME);
  return { bus, mpu };
}

// the sequence numbers of samples read (their first raw int16, x of the accelerometers)
const seqOf = (mpu, samples) => samples.map((s) => Math.round(s.accelerometers.x * mpu.accelerometerSensitivity));

for (const [Chip, whoAmI, fifoSize] of [[Mpu6500, 0x70, 512], [Mpu6050, 0x68, 1024]]) {
  describe(`${Chip.chip.name} FIFO over a slow link`, () => {
    it('slow (150 ms a transfer): the overflow during the read thrown, the FIFO restarted, nothing damaged handed out', async () => {
      const { bus, mpu } = await streaming(Chip, whoAmI, fifoSize, 150);
      let thrown = 0;
      for (let i = 0; i < 20; i++) {
        try {
          const seq = seqOf(mpu, await mpu.readFifo());
          for (let k = 1; k < seq.length; k++) assert.equal(seq[k], seq[k - 1] + 1, `read ${i}: frames in order, none lost or misaligned`);
        } catch (e) {
          assert.match(e.message, /FIFO overflowed: samples lost/);
          thrown++;
        }
      }
      assert.ok(thrown > 0, 'an overflow reported');
      assert.ok(bus.reads.includes(REG_INT_STATUS), 'INT_STATUS read');
    });

    it('fast (2 ms a transfer): every frame in order, only the count and the bytes read (INT_STATUS never)', async () => {
      const { bus, mpu } = await streaming(Chip, whoAmI, fifoSize, 2);
      const before = bus.reads.length;
      const seq = [];
      for (let i = 0; i < 20; i++) seq.push(...seqOf(mpu, await mpu.readFifo()));
      seq.forEach((s, k) => assert.equal(s, k));
      assert.deepEqual([...new Set(bus.reads.slice(before))].sort(), [0x72, 0x74]); // FIFO_COUNT_H, FIFO_R_W
    });

    it('a flag left set before startFifo() isn\'t taken for a new overflow', async () => {
      const bus = new FakeMpu(whoAmI, { fifoSize });
      const mpu = new Chip(bus);
      mpu.now = () => bus.time;
      await mpu.init();
      bus.regs[REG_INT_STATUS] = 0x10; // an overflow long before
      await mpu.startFifo({ divider: 3 });
      bus.latency = 150;
      bus.fifo = new Array(fifoSize - 3 * FRAME).fill(0); // near full: the read checks the flag
      assert.equal((await mpu.readFifo()).length > 0, true);
    });
  });
}
