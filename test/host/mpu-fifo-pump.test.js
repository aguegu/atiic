// the MPU FIFO through a bus's FIFO pump (a dart from protocol 1.2: dart
// reads the FIFO itself every period, readFifo() takes the frames in one
// transfer): on a link slow enough to overflow the FIFO between plain reads
// (150 ms a transfer, a BLE 4.0 Mac, 2026-11-12), nothing lost; a pump that
// falls behind (the bus stalled) is told as an overflow, the FIFO and pump
// restarted
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Mpu6050, Mpu6500 } from '../../src/index.js';
import FakeMpu from './fake-mpu.js';

const RATE = 250; // Hz: startFifo({ divider: 3 }) with the filter on
const FRAME = 12; // accelerometers and gyroscopes
const BUFFER = 4096; // a dart's FIFO buffer (INFO, 1.2)
const READ_MAX = 1024;

// a fake MPU behind a fake dart's pump: the pump's periods run on the
// chip's clock (each a count and a read, no time of their own, as I2C at
// 400 kHz is to a link's), run as the clock passes them; a take costs
// `latency` of it, as every transfer; `stalled` holds
// the pump off (the bus busy) until that time
class PumpBus extends FakeMpu {
  fifoPump = true;

  async fifoStart(address, job) {
    this.job = { ...job, address, next: this.time + job.periodMs };
    this.pumped = [];
    this.flags = { running: true, full: false };
    this.starts = (this.starts ?? 0) + 1;
  }

  // the chip's clock on, the pump's periods run as it passes them (during
  // the driver's own transfers too)
  advance(ms) {
    const t = this.time + ms;
    const j = this.job;
    for (; j && this.flags.running && j.next <= t; j.next += j.periodMs) {
      super.advance(j.next - this.time);
      if (j.next < (this.stalled ?? 0)) continue;
      const count = this.fifo.length;
      if (count >= j.full) {
        this.flags = { running: false, full: true };
        break;
      }
      let n = Math.min(count, BUFFER - this.pumped.length, READ_MAX);
      n -= n % j.frame;
      this.pumped.push(...this.fifo.splice(0, n));
    }
    super.advance(t - this.time);
  }

  async fifoTake(most) {
    this.advance(this.latency);
    const n = Math.min(most, this.pumped.length) - (Math.min(most, this.pumped.length) % this.job.frame);
    return { ...this.flags, error: null, data: Uint8Array.from(this.pumped.splice(0, n)) };
  }

  async fifoStop() {
    this.job = null;
  }
}

async function streaming(Chip, whoAmI, fifoSize, latency) {
  const bus = new PumpBus(whoAmI, { fifoSize });
  const mpu = new Chip(bus);
  mpu.now = () => bus.time;
  await mpu.init();
  await mpu.startFifo({ divider: 3 });
  bus.latency = latency;
  bus.produce(RATE, FRAME);
  return { bus, mpu };
}

const seqOf = (mpu, samples) => samples.map((s) => Math.round(s.accelerometers.x * mpu.accelerometerSensitivity));

for (const [Chip, whoAmI, fifoSize] of [[Mpu6500, 0x70, 512], [Mpu6050, 0x68, 1024]]) {
  describe(`${Chip.chip.name} FIFO through a bus's pump`, () => {
    it('the pump started with the FIFO: its registers, frame, a period well inside the FIFO\'s time, full under its size', async () => {
      const { bus } = await streaming(Chip, whoAmI, fifoSize, 0);
      assert.equal(bus.job.address, 0x68);
      assert.deepEqual([bus.job.count, bus.job.data, bus.job.frame], [0x72, 0x74, FRAME]);
      const fifoMs = (1000 * fifoSize) / FRAME / RATE;
      assert.ok(bus.job.periodMs <= fifoMs / 4, `${bus.job.periodMs} ms of ${fifoMs}`);
      assert.ok(bus.job.full < fifoSize && bus.job.full % FRAME === fifoSize % FRAME);
    });

    it('slow (150 ms a transfer, 400 ms at times): every frame, in order, nothing thrown', async () => {
      const { bus, mpu } = await streaming(Chip, whoAmI, fifoSize, 150);
      const seq = [];
      for (let i = 0; i < 60; i++) {
        bus.latency = i % 10 === 9 ? 400 : 150;
        seq.push(...seqOf(mpu, await mpu.readFifo()));
      }
      assert.ok(seq.length > 0.9 * RATE * (bus.time / 1000) - RATE, `${seq.length} frames in ${bus.time} ms`);
      seq.forEach((s, k) => assert.equal(s, k, `frame ${k}`));
    });

    it('the pump held off past the FIFO\'s time: an overflow thrown, the FIFO and pump restarted, frames in order after', async () => {
      const { bus, mpu } = await streaming(Chip, whoAmI, fifoSize, 30);
      await mpu.readFifo();
      bus.stalled = bus.time + (1000 * fifoSize) / FRAME / RATE + 50;
      bus.latency = bus.stalled - bus.time + 30;
      await assert.rejects(mpu.readFifo(), /FIFO overflowed: samples lost/);
      assert.equal(bus.starts, 2);
      bus.latency = 30;
      let seq = [];
      for (let i = 0; i < 10; i++) seq.push(...seqOf(mpu, await mpu.readFifo()));
      seq = seq.filter((s, k) => k === 0 || s !== seq[k - 1]);
      for (let k = 1; k < seq.length; k++) assert.equal(seq[k], seq[k - 1] + 1, `after the restart, frame ${k}`);
    });

    it('stopFifo stops the pump', async () => {
      const { bus, mpu } = await streaming(Chip, whoAmI, fifoSize, 0);
      await mpu.stopFifo();
      assert.equal(bus.job, null);
      assert.equal(mpu.pumping, false);
    });
  });
}
