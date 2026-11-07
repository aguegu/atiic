// the CH347's I2C packets, and Ch347 on a fake CH347, no hardware
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKET_SIZE, CMD_I2C_STREAM, STM_STA, STM_STO, STM_OUT, STM_IN, STM_END,
  speedPacket, transaction, packets,
} from '../../src/adapters/ch347/protocol.js';
import Ch347, { findInterface } from '../../src/adapters/ch347/index.js';

const hexOf = (p) => Array.from(p.data, (b) => b.toString(16).padStart(2, '0')).join(' ');

describe('ch347 protocol', () => {
  it('sets the speed, 400 kHz by SET 2; refuses others', () => {
    assert.deepEqual(Array.from(speedPacket(400000)), [0xaa, 0x62, 0x00]);
    assert.throws(() => speedPacket(1000000));
  });

  it('probes an address by OUT 1 (never OUT 0), its ack replied', () => {
    const [p, ...rest] = packets(transaction(0x68));
    assert.equal(rest.length, 0);
    assert.equal(hexOf(p), 'aa 74 81 d0 75 00');
    assert.equal(p.reply, 1);
    assert.deepEqual(p.acks, [0]);
    assert.deepEqual(p.addresses, [0]);
  });

  it('writes a register: the address and data in one OUT, every byte acked', () => {
    const [p] = packets(transaction(0x68, [0x6b, 0x00]));
    assert.equal(hexOf(p), 'aa 74 83 d0 6b 00 75 00');
    assert.deepEqual(p.acks, [0, 1, 2]);
    assert.deepEqual(p.addresses, [0]);
  });

  it('reads WHO_AM_I as measured on r8845: 01 01 01 68 came back to this', () => {
    const [p] = packets(transaction(0x68, [0x75], 1));
    assert.equal(hexOf(p), 'aa 74 82 d0 75 74 81 d1 c0 75 00');
    assert.equal(p.reply, 4);
    assert.deepEqual(p.acks, [0, 1, 2]);
    assert.deepEqual(p.addresses, [0, 2]);
  });

  it('reads 14 bytes: IN 13 acked, the last by IN 0', () => {
    const [p] = packets(transaction(0x68, [0x3b], 14));
    assert.equal(hexOf(p), 'aa 74 82 d0 3b 74 81 d1 cd c0 75 00');
    assert.equal(p.reply, 3 + 14);
  });

  it('a 1000-byte read: no reply over 512, no command split, the last byte nacked', () => {
    const ps = packets(transaction(0x68, [0x00], 1000));
    assert.ok(ps.length > 1);
    let total = 0;
    for (const p of ps) {
      assert.equal(p.data[0], CMD_I2C_STREAM);
      assert.equal(p.data.at(-1), STM_END);
      assert.ok(p.data.length <= PACKET_SIZE);
      assert.ok(p.reply <= PACKET_SIZE);
      total += p.reply - p.acks.length;
    }
    assert.equal(total, 1000);
    const cmds = ps.flatMap((p) => Array.from(p.data.slice(1, -1)));
    assert.equal(cmds[0], STM_STA);
    assert.equal(cmds.at(-1), STM_STO);
    assert.equal(cmds.at(-2), STM_IN);
  });

  it('a long write: 63 bytes an OUT at most, every byte once, in order', () => {
    const bytes = Array.from({ length: 200 }, (_, i) => i);
    const cmds = packets(transaction(0x3c, bytes)).flatMap((p) => Array.from(p.data.slice(1, -1)));
    const written = [];
    for (let i = 0; i < cmds.length;) {
      if ((cmds[i] & 0xc0) === STM_OUT) {
        const n = cmds[i] & 0x3f;
        assert.ok(n > 0, 'no OUT 0');
        written.push(...cmds.slice(i + 1, i + 1 + n));
        i += 1 + n;
      } else i += 1;
    }
    assert.deepEqual(written, [0x3c << 1, ...bytes]);
  });

  it('finds the vendor interface and its bulk endpoints (a CH347T in mode 1: interface 2)', () => {
    const ep = (endpointNumber, direction, type) => ({ endpointNumber, direction, type });
    const configuration = {
      interfaces: [
        { interfaceNumber: 0, alternate: { interfaceClass: 2, endpoints: [ep(3, 'in', 'interrupt')] } },
        { interfaceNumber: 1, alternate: { interfaceClass: 10, endpoints: [ep(4, 'out', 'bulk'), ep(4, 'in', 'bulk')] } },
        { interfaceNumber: 2, alternate: { interfaceClass: 255, endpoints: [ep(5, 'in', 'interrupt'), ep(6, 'out', 'bulk'), ep(6, 'in', 'bulk')] } },
      ],
    };
    assert.deepEqual(findInterface(configuration), { number: 2, out: 6, in: 6 });
    assert.throws(() => findInterface({ interfaces: configuration.interfaces.slice(0, 2) }), /no vendor interface/);
  });
});

// a fake CH347: runs the stream commands against devices on a pretend bus,
// { address: { regs, refuse } } (refuse: a register index it won't take)
function fakeCh347(devices) {
  const replies = [];
  let target = null, pointer = 0, first = false;
  const device = {
    opened: true,
    configuration: { interfaces: [{ interfaceNumber: 2, alternate: { interfaceClass: 255, endpoints: [{ endpointNumber: 6, direction: 'out', type: 'bulk' }, { endpointNumber: 6, direction: 'in', type: 'bulk' }] } }] },
    claimInterface: async () => {},
    sent: [],
    transferOut: async (ep, data) => {
      device.sent.push(Array.from(data));
      const reply = [];
      for (let i = 1; i < data.length;) {
        const c = data[i++];
        if (c === STM_END) break;
        if (c === STM_STA) { target = undefined; continue; }
        if (c === STM_STO) { target = null; continue; }
        if ((c & 0xe0) === 0x60) continue; // SET
        if ((c & 0xc0) === STM_OUT) {
          for (let k = 0; k < (c & 0x3f); k++) {
            const b = data[i++];
            if (target === undefined) { // the address byte
              target = devices[b >> 1] ?? false;
              first = true;
              reply.push(target ? 1 : 0);
            } else if (!target) reply.push(0);
            else if (first) { pointer = b; first = false; reply.push(1); }
            else if (pointer === target.refuse) reply.push(0);
            else { target.regs[pointer++] = b; reply.push(1); }
          }
          continue;
        }
        if ((c & 0xc0) === STM_IN) {
          for (let k = 0; k < ((c & 0x3f) || 1); k++) reply.push(target ? target.regs[pointer++] ?? 0 : 0xff);
        }
      }
      if (reply.length) replies.push(Uint8Array.from(reply));
      return { status: 'ok', bytesWritten: data.length };
    },
    transferIn: async () => {
      const d = replies.shift();
      return { status: 'ok', data: new DataView(d.buffer) };
    },
  };
  return device;
}

describe('ch347 bus (fake)', () => {
  const mpu = () => ({ regs: Object.assign(new Array(128).fill(0), { 0x75: 0x68 }), refuse: 0x7f });

  it('scans, reads WHO_AM_I, writes and reads back', async () => {
    const bus = await new Ch347(fakeCh347({ 0x68: mpu() })).open(400000);
    assert.deepEqual(await bus.scan(), [0x68]);
    assert.deepEqual(Array.from(await bus.writeRead(0x68, [0x75], 1)), [0x68]);
    await bus.write(0x68, [0x19, 0x5a]);
    assert.deepEqual(Array.from(await bus.writeRead(0x68, [0x19], 1)), [0x5a]);
  });

  it('a missing device throws; acks() says false', async () => {
    const bus = await new Ch347(fakeCh347({ 0x68: mpu() })).open();
    await assert.rejects(bus.writeRead(0x2a, [0x00], 4), /^Error: no ack from 0x2a$/);
    assert.equal(await bus.acks(0x2a), false);
    assert.equal(await bus.acks(0x68), true);
  });

  it('a written byte refused throws, naming it', async () => {
    const bus = await new Ch347(fakeCh347({ 0x68: mpu() })).open();
    await assert.rejects(bus.write(0x68, [0x7d, 1, 2, 3]), /no ack from 0x68 for byte 3/); // 0x7d, 0x7e, then 0x7f refused
  });

  it('a long read across packets comes back whole', async () => {
    const dev = { regs: Array.from({ length: 1200 }, (_, i) => i & 0xff) };
    const fake = fakeCh347({ 0x50: dev });
    const bus = await new Ch347(fake).open();
    const got = await bus.writeRead(0x50, [0x00], 1000);
    assert.deepEqual(Array.from(got), dev.regs.slice(0, 1000));
    assert.ok(fake.sent.length > 2);
  });
});
