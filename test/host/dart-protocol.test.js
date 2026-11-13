// dart's command set (docs/dart.md) and the Dart adapter on a fake dart: a
// USBDevice that takes requests as the firmware does and answers from 256
// registers at 0x52, no hardware
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Dart, { OP, DartError } from '../../src/adapters/dart/index.js';
import { fakeDart } from './fake-dart.js';

const SLAVE = 0x52; // fake-dart.js's

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

  it('any name: a dart is told by its INFO reply; close releases the interface, so it opens again', async () => {
    const dev = fakeDart({ productName: 'anything at all' });
    const bus = await new Dart(dev).open();
    await bus.close();
    assert.equal(dev.claimed, false);
    await new Dart(dev).open();
    assert.equal(dev.claimed, true);
  });

  it('a device that never answers INFO: not a dart, closed, after identifyMs', async () => {
    const dev = fakeDart();
    dev.transferIn = () => new Promise(() => {}); // never
    const t0 = Date.now();
    await assert.rejects(new Dart(dev).open(100000, { identifyMs: 50 }), /no answer to INFO in 50 ms: not a dart/);
    assert.ok(Date.now() - t0 < 500);
    assert.equal(dev.opened, false);
  });

  it('a device that answers something else: not a dart', async () => {
    const dev = fakeDart();
    dev.transferIn = async () => ({ status: 'ok', data: new DataView(Uint8Array.of(0x42, 1, 0, 0, 0, 0).buffer) }); // another op, tag 1
    await assert.rejects(new Dart(dev).open(), /not a dart: a reply to op 66, not 1/);
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

  it('1.1: any speed from 7327 Hz to 400 kHz (10 kHz for a slow device); 1.0 only 100 and 400', async () => {
    const dev = fakeDart({ protocol: 0x0101 });
    const bus = await new Dart(dev).open(10000);
    assert.deepEqual([...dev.sent.at(-1)], [OP.SPEED, dev.sent.at(-1)[1], 4, 0, 0x10, 0x27, 0, 0]);
    await assert.rejects(bus.speed(7326), (e) => e.status === 'BAD_SPEED');
    await assert.rejects(new Dart(fakeDart()).open(10000), (e) => e.status === 'BAD_SPEED');
  });

  it('1.1: a bus held low names the line, from a transfer and from a scan', async () => {
    const bus = await new Dart(fakeDart({ protocol: 0x0101 })).open();
    const dev = fakeDart({ protocol: 0x0101, held: ['SCL'] });
    Object.assign(bus.device, { transferOut: dev.transferOut.bind(dev), transferIn: dev.transferIn.bind(dev) });
    await assert.rejects(bus.read(0x1a, 5), (e) => e.status === 'BUS_BUSY' && e.message === 'bus held low: SCL (at 0x1a)' && e.held.join() === 'SCL');
    await assert.rejects(bus.scan(), (e) => e.message === 'bus held low: SCL');
  });

  it('1.0: BUS_BUSY as it was (its count isn\'t the lines)', async () => {
    const bus = await new Dart(fakeDart()).open();
    const dev = fakeDart({ held: ['SDA'] });
    Object.assign(bus.device, { transferOut: dev.transferOut.bind(dev), transferIn: dev.transferIn.bind(dev) });
    await assert.rejects(bus.read(0x1a, 1), (e) => e.status === 'BUS_BUSY' && e.message === 'BUS_BUSY at 0x1a' && e.held === undefined);
  });

  it('speed with a stretch limit: six bytes, the limit in ms', async () => {
    const dev = fakeDart();
    const bus = await new Dart(dev).open();
    await bus.speed(400000, 90);
    assert.deepEqual([...dev.sent.at(-1)], [OP.SPEED, dev.sent.at(-1)[1], 6, 0, 0x80, 0x1a, 0x06, 0x00, 90, 0]);
  });

  it('1.2: fifoPump; fifoStart\'s request (address, count and data registers, frame, full, period); fifoTake\'s flags and frames; fifoStop', async () => {
    const old = await new Dart(fakeDart({ protocol: 0x0101 })).open();
    assert.equal(old.fifoPump, false);
    const dev = fakeDart({ protocol: 0x0102 });
    const bus = await new Dart(dev).open();
    assert.equal(bus.fifoPump, true);
    assert.equal((await bus.info()).fifoBuffer, 4096);
    dev.regs.set([0x00, 24], 0x72); // a count of 24, big-endian
    dev.regs.set(Array.from({ length: 24 }, (_, i) => i + 1), 0x74);
    await bus.fifoStart(SLAVE, { count: 0x72, data: 0x74, frame: 12, full: 500, periodMs: 20 });
    assert.deepEqual([...dev.sent.at(-1)], [OP.FIFO_START, dev.sent.at(-1)[1], 8, 0, SLAVE, 0x72, 0x74, 12, 0xf4, 0x01, 20, 0]);
    const t = await bus.fifoTake(1020);
    assert.deepEqual([t.running, t.full, t.error], [true, false, null]);
    assert.deepEqual([...t.data], Array.from({ length: 24 }, (_, i) => i + 1));
    dev.regs.set([0x01, 0xf4], 0x72); // 500: full
    assert.deepEqual(Object.values(await bus.fifoTake()).slice(0, 2), [false, true]);
    await bus.fifoStart(SLAVE + 1, { count: 0x72, data: 0x74, frame: 12, full: 500, periodMs: 20 });
    const e = await bus.fifoTake();
    assert.ok(e.error instanceof DartError && e.error.status === 'NO_DEVICE' && /no ack from 0x53/.test(e.error.message));
    await bus.fifoStop();
    assert.deepEqual([...dev.sent.at(-1)].filter((_, i) => i !== 1), [OP.FIFO_STOP, 0, 0]);
  });
});
