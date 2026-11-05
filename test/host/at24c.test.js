// the AT24Cxx driver against a fake AT24C08: blocks by device address,
// sequential reads across blocks, page writes wrapping in their page, the
// write cycle's acknowledge polling
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { At24c } from '../../src/index.js';

class FakeAt24c08 {
  constructor({ busyPolls = 2 } = {}) {
    this.mem = new Uint8Array(1024).fill(0xff);
    this.writes = [];
    this.busyPolls = busyPolls;
    this.busy = 0;
  }

  block(address) {
    assert.ok(address >= 0x50 && address <= 0x53, `0x${address.toString(16)}`);
    return (address - 0x50) * 256;
  }

  async acks(address) {
    this.block(address);
    if (this.busy > 0) { this.busy--; return false; }
    return true;
  }

  // a page write: the word address's low 4 bits count on, wrapping in the page
  async write(address, [word, ...data]) {
    assert.equal(this.busy, 0, 'written while busy');
    const start = this.block(address) + word;
    const page = start & ~0x0f;
    data.forEach((v, i) => { this.mem[page + ((start + i) & 0x0f)] = v; });
    this.writes.push([address, word, data.length]);
    this.busy = this.busyPolls;
  }

  async writeRead(address, [word], n) {
    const start = this.block(address) + word;
    return Uint8Array.from({ length: n }, (_, i) => this.mem[(start + i) % 1024]);
  }
}

describe('at24c (host)', () => {
  it('reads across a block: one read from the first block\'s address', async () => {
    const bus = new FakeAt24c08();
    bus.mem.set([1, 2, 3, 4], 0xfe);
    const e = new At24c(bus);
    assert.deepEqual([...await e.read(0xfe, 4)], [1, 2, 3, 4]);
    assert.deepEqual([...await e.read(0x301, 1)], [0xff]);
  });

  it('writes in pages, split at page and block edges, each cycle polled', async () => {
    const bus = new FakeAt24c08();
    const e = new At24c(bus);
    const data = Array.from({ length: 24 }, (_, i) => i);
    await e.write(0x2f8, data);
    assert.deepEqual(bus.writes, [[0x52, 0xf8, 8], [0x53, 0x00, 16]]);
    assert.deepEqual([...bus.mem.slice(0x2f8, 0x310)], data);
    assert.equal(bus.mem[0x2f7], 0xff);
    assert.equal(bus.mem[0x310], 0xff);
  });

  it('gives up on a write cycle that never ends', async () => {
    const e = new At24c(new FakeAt24c08({ busyPolls: Infinity }));
    await assert.rejects(e.write(0, [1]), /still writing/);
  });

  it('refuses bytes outside its size, and an unknown model', async () => {
    const e = new At24c(new FakeAt24c08());
    await assert.rejects(e.read(1020, 8), /outside its 1024/);
    await assert.rejects(e.write(1023, [1, 2]), /outside its 1024/);
    assert.throws(() => new At24c(new FakeAt24c08(), { model: 'AT24C32' }), /no AT24C32/);
  });

  it('knows the smaller ones\' 8-byte pages', async () => {
    const bus = new FakeAt24c08();
    await new At24c(bus, { model: 'AT24C02' }).write(4, Array(8).fill(0));
    assert.deepEqual(bus.writes.map((w) => w[2]), [4, 4]);
  });
});
