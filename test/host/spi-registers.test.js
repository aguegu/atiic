// SpiRegisters against a fake bus: the chip select around each transfer,
// bit 7 on reads, the register's bytes returned
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpiRegisters } from '../../src/index.js';

class FakeBus {
  constructor(reply = []) { this.log = []; this.reply = reply; }
  async pins(lines) { this.log.push(['pins', { ...lines }]); }
  async spi(bytes) {
    this.log.push(['spi', Array.from(bytes)]);
    return Uint8Array.from(bytes, (_, i) => (i === 0 ? 0xff : this.reply[i - 1] ?? 0));
  }
}

describe('spi registers (host)', () => {
  it('writeRead: CS low, the register with bit 7, n dummy bytes, CS high; the n bytes back', async () => {
    const bus = new FakeBus([0x70]);
    const back = await new SpiRegisters(bus, { cs: 'D4' }).writeRead(0x68, [0x75], 1);
    assert.deepEqual(Array.from(back), [0x70]);
    assert.deepEqual(bus.log, [['pins', { D4: false }], ['spi', [0xf5, 0]], ['pins', { D4: true }]]);
  });

  it('write: CS low, the register and data as given (a burst), CS high', async () => {
    const bus = new FakeBus();
    await new SpiRegisters(bus, { cs: 'D4' }).write(0x68, [0x19, 0x07, 0x01]);
    assert.deepEqual(bus.log, [['pins', { D4: false }], ['spi', [0x19, 0x07, 0x01]], ['pins', { D4: true }]]);
  });

  it('open: the chip select high first', async () => {
    const bus = new FakeBus();
    await new SpiRegisters(bus, { cs: 'D2' }).open();
    assert.deepEqual(bus.log, [['pins', { D2: true }]]);
  });

  it('writeRead takes one register byte', async () => {
    await assert.rejects(new SpiRegisters(new FakeBus()).writeRead(0, [1, 2], 1), /one register byte/);
  });

  it('CS goes high even when the transfer fails', async () => {
    const bus = new FakeBus();
    bus.spi = async () => { throw new Error('gone'); };
    await assert.rejects(new SpiRegisters(bus).write(0, [1]), /gone/);
    assert.deepEqual(bus.log.at(-1), ['pins', { D4: true }]);
  });
});
