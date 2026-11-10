// dart's command set (docs/dart.md) and the Dart adapter on a fake dart: a
// USBDevice that takes requests as the firmware does and answers from 256
// registers at 0x52, no hardware
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Dart, { OP, DartError } from '../../src/adapters/dart/index.js';

const SLAVE = 0x52;

// a fake dart: the bytes of each request kept, replies built as the
// firmware's main.c does (op, tag, status, 0, count; data on OK)
function fakeDart({ productName = 'dart', writable = 0x100, stale = null, protocol = 0x0100 } = {}) {
  const regs = new Uint8Array(256);
  let pointer = 0;
  let pending = null;
  const sent = [];
  const reply = (q, status, data = [], count = data.length) => {
    const r = [q[0], q[1], status & 0xff, 0, count & 0xff, count >> 8];
    return Uint8Array.from(status ? r : [...r, ...data]);
  };
  const serve = (q) => {
    const len = q[2] | (q[3] << 8);
    const p = q.slice(4);
    if (p.length !== len) return reply(q, -17);
    if (q[0] === OP.INFO) return reply(q, 0, [protocol & 0xff, protocol >> 8, 1, 0, 0xa0, 0x86, 0x01, 0, 2, 0, 0, 4, 0, 4, 0x7f, 0x59, 0xcf, 0xcc, 0x52, 0x93, 0xd9, 0x46]);
    if (q[0] === OP.SPEED) {
      const hz = p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24);
      return reply(q, hz === 100000 || hz === 400000 ? 0 : -18);
    }
    if (q[0] === OP.SCAN) return reply(q, 0, [SLAVE].filter((a) => a >= p[0] && a <= p[1]));
    if (q[0] === OP.I2C) {
      const [a, rl, rh, ...w] = p;
      const n = rl | (rh << 8);
      if (a !== SLAVE) return reply(q, -1);
      if (w.length) pointer = w[0];
      for (let i = 1; i < w.length; i++) {
        if (pointer >= writable) return reply(q, -5, [], i); // the pointer and i - 1 registers taken
        regs[pointer] = w[i];
        pointer = (pointer + 1) & 0xff;
      }
      const data = [];
      for (let i = 0; i < n; i++) {
        data.push(regs[pointer]);
        pointer = (pointer + 1) & 0xff;
      }
      return reply(q, 0, data);
    }
    return reply(q, -16);
  };
  return {
    regs,
    sent,
    productName,
    opened: false,
    configuration: null,
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    async selectConfiguration() { this.configuration = {}; },
    claimed: false,
    async claimInterface() { this.claimed = true; },
    async releaseInterface() { this.claimed = false; },
    async transferOut(ep, data) {
      const q = Uint8Array.from(data);
      sent.push(q);
      pending = serve(q);
      return { status: 'ok', bytesWritten: q.length };
    },
    async transferIn(ep, n) {
      let r = pending;
      if (stale) {
        r = Uint8Array.from([pending[0], pending[1] ^ 0x80, 0, 0, 0, 0]); // another tag's reply first
        stale = null;
      } else {
        pending = null;
      }
      assert.ok(n >= r.length, `room for ${r.length}`);
      return { status: 'ok', data: new DataView(r.buffer) };
    },
  };
}

describe('dart protocol', () => {
  it('opens: checks the product name, reads INFO, sets 100 kHz', async () => {
    const dev = fakeDart();
    await new Dart(dev).open();
    assert.deepEqual([...dev.sent[0]], [OP.INFO, 1, 0, 0]);
    assert.deepEqual([...dev.sent[1]], [OP.SPEED, 2, 4, 0, 0xa0, 0x86, 0x01, 0x00]);
  });

  it('takes a newer minor of the command set, refuses another major', async () => {
    await new Dart(fakeDart({ protocol: 0x0103 })).open();
    await assert.rejects(new Dart(fakeDart({ protocol: 0x0200 })).open(), /command set 2\.0, this atiic speaks 1\.x/);
  });

  it('takes a product string ending in "dart", any case ("Dart"); close releases the interface, so it opens again', async () => {
    const dev = fakeDart({ productName: 'Dart' });
    const bus = await new Dart(dev).open();
    await bus.close();
    assert.equal(dev.claimed, false);
    await new Dart(dev).open();
    assert.equal(dev.claimed, true);
  });

  it('refuses an ffff:da92 that isn\'t a dart', async () => {
    await assert.rejects(new Dart(fakeDart({ productName: 'other' })).open(), /not a dart/);
  });

  it('a register read: one request, address, read length, the register; the bytes back', async () => {
    const dev = fakeDart();
    const bus = await new Dart(dev).open();
    dev.regs.set([0x70, 0x71], 0x75);
    assert.deepEqual([...await bus.writeRead(SLAVE, [0x75], 2)], [0x70, 0x71]);
    assert.deepEqual([...dev.sent.at(-1)], [OP.I2C, dev.sent.at(-1)[1], 4, 0, SLAVE, 2, 0, 0x75]);
  });

  it('write, read, acks, scan', async () => {
    const dev = fakeDart();
    const bus = await new Dart(dev).open();
    await bus.write(SLAVE, [0x10, 1, 2, 3]);
    assert.deepEqual([...dev.regs.slice(0x10, 0x13)], [1, 2, 3]);
    assert.deepEqual([...await bus.read(SLAVE, 2)], [0, 0]); // from 0x13 on
    assert.equal(await bus.acks(SLAVE), true);
    assert.equal(await bus.acks(0x53), false);
    assert.deepEqual(await bus.scan(), [SLAVE]);
    assert.deepEqual([...dev.sent.at(-1)], [OP.SCAN, dev.sent.at(-1)[1], 2, 0, 0x08, 0x77]);
  });

  it('NO_DEVICE throws as the CH341\'s adapter does: no ack from 0x..', async () => {
    const bus = await new Dart(fakeDart()).open();
    await assert.rejects(bus.read(0x2a, 1), (e) => e instanceof DartError && e.status === 'NO_DEVICE' && e.message === 'no ack from 0x2a');
  });

  it('REFUSED: the device there, a data byte refused, the bytes before it counted', async () => {
    const bus = await new Dart(fakeDart({ writable: 0xf4 })).open();
    await assert.rejects(bus.write(SLAVE, [0xf0, 1, 2, 3, 4, 5, 6]),
      (e) => e.status === 'REFUSED' && e.count === 5 && e.message === '0x52 refused byte 5');
  });

  it('a speed not offered: BAD_SPEED; an unknown op: UNKNOWN_OP', async () => {
    const bus = await new Dart(fakeDart()).open();
    await assert.rejects(bus.speed(250000), (e) => e.status === 'BAD_SPEED');
    assert.equal((await bus.request(0x7e)).status, -16);
  });

  it('info: the protocol\'s and firmware\'s versions, speed, stretch limit, limits, the unique ID', async () => {
    const bus = await new Dart(fakeDart()).open();
    assert.deepEqual(await bus.info(), { protocol: 0x0100, version: 1, speed: 100000, stretchMs: 2, payloadMax: 1024, readMax: 1024, uniqueId: '7F59CFCC5293D946' });
  });

  it('a reply with another tag (a request cut short before) is skipped', async () => {
    const dev = fakeDart();
    const bus = await new Dart(dev).open();
    dev.regs[0] = 0x42;
    Object.assign(dev, fakeDart({ stale: true }), { regs: dev.regs }); // the next read sees a stale reply first
    assert.ok((await bus.scan()).includes(SLAVE));
  });

  it('speed with a stretch limit: six bytes, the limit in ms', async () => {
    const dev = fakeDart();
    const bus = await new Dart(dev).open();
    await bus.speed(400000, 90);
    assert.deepEqual([...dev.sent.at(-1)], [OP.SPEED, dev.sent.at(-1)[1], 6, 0, 0x80, 0x1a, 0x06, 0x00, 90, 0]);
  });
});
