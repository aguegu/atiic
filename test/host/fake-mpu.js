// a fake MPU-60x0/65x0 on a fake bus for the host tests: its registers, its
// FIFO, and every write a driver makes
import assert from 'node:assert/strict';

const ADDRESS = 0x68;
const REG_FIFO_COUNT_H = 0x72;
const REG_FIFO_R_W = 0x74;
const REG_WHO_AM_I = 0x75;

class FakeMpu {
  constructor(whoAmI) {
    this.regs = new Uint8Array(128);
    this.regs[REG_WHO_AM_I] = whoAmI;
    this.fifo = [];
    this.writes = [];
  }

  async write(address, bytes) {
    assert.equal(address, ADDRESS);
    this.writes.push(Array.from(bytes));
    const [reg, ...values] = bytes;
    values.forEach((v, i) => { this.regs[reg + i] = v; });
  }

  async writeRead(address, [reg], n) {
    assert.equal(address, ADDRESS);
    if (reg === REG_FIFO_R_W) return Uint8Array.from(this.fifo.splice(0, n));
    if (reg === REG_FIFO_COUNT_H) return Uint8Array.of(this.fifo.length >> 8, this.fifo.length & 0xff);
    return this.regs.slice(reg, reg + n);
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
