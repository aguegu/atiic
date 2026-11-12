// a fake MPU-60x0/65x0 on a fake bus for the host tests: its registers, its
// FIFO, and every write a driver makes
import assert from 'node:assert/strict';

const ADDRESS = 0x68;
const REG_FIFO_COUNT_H = 0x72;
const REG_FIFO_R_W = 0x74;
const REG_WHO_AM_I = 0x75;
const REG_INT_STATUS = 0x3a;
const INT_FIFO_OFLOW = 0x10;

class FakeMpu {
  constructor(whoAmI, { fifoSize = 1024 } = {}) {
    this.regs = new Uint8Array(128);
    this.regs[REG_WHO_AM_I] = whoAmI;
    this.fifo = [];
    this.writes = [];
    this.reads = []; // the registers each writeRead started at
    // a clock (ms): each transfer takes `latency`, and while it's in flight a
    // producing chip (produce()) adds frames at its rate; past fifoSize the
    // oldest bytes go and INT_STATUS's FIFO_OFLOW_INT sets (RM-MPU-6000A-00
    // rev 4.0, Register 116; an MPU-6500 measured so, interrupt not enabled)
    this.fifoSize = fifoSize;
    this.time = 0;
    this.latency = 0;
    this.producing = null;
  }

  // frames of `frameBytes` at `rate` Hz from now on, each a sequence number
  // in its first two bytes (then zeros), so lost or misaligned ones show
  produce(rate, frameBytes) {
    this.producing = { rate, frameBytes, due: 0, seq: 0 };
  }

  advance(ms) {
    this.time += ms;
    const p = this.producing;
    if (!p) return;
    p.due += (ms / 1000) * p.rate;
    for (; p.due >= 1; p.due--) {
      const frame = new Array(p.frameBytes).fill(0);
      frame[0] = (p.seq >> 8) & 0xff;
      frame[1] = p.seq & 0xff;
      p.seq++;
      this.fifo.push(...frame);
      if (this.fifo.length > this.fifoSize) {
        this.fifo.splice(0, this.fifo.length - this.fifoSize);
        this.regs[REG_INT_STATUS] |= INT_FIFO_OFLOW;
      }
    }
  }

  async write(address, bytes) {
    assert.equal(address, ADDRESS);
    this.advance(this.latency / 2);
    this.writes.push(Array.from(bytes));
    const [reg, ...values] = bytes;
    values.forEach((v, i) => { this.regs[reg + i] = v; });
    if (reg === 0x6a && values[0] & 0x04) this.fifo = []; // USER_CTRL's FIFO_RESET
    this.advance(this.latency / 2);
  }

  // the chip sees a transfer halfway through its latency
  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    this.reads.push(reg);
    this.advance(this.latency / 2);
    let r;
    if (reg === REG_FIFO_R_W) r = Uint8Array.from(this.fifo.splice(0, n));
    else if (reg === REG_FIFO_COUNT_H) r = Uint8Array.of(this.fifo.length >> 8, this.fifo.length & 0xff);
    else if (reg === REG_INT_STATUS) {
      r = this.regs.slice(reg, reg + n);
      this.regs[REG_INT_STATUS] = 0; // cleared by the read
    } else r = this.regs.slice(reg, reg + n);
    this.advance(this.latency / 2);
    return r;
  }

  // big-endian int16s into consecutive registers
  set(reg, values) {
    values.forEach((v, i) => {
      this.regs[reg + 2 * i] = (v >> 8) & 0xff;
      this.regs[reg + 2 * i + 1] = v & 0xff;
    });
  }

  queue(values) {
    for (const v of values) this.fifo.push((v >> 8) & 0xff, v & 0xff);
  }
}

export default FakeMpu;
