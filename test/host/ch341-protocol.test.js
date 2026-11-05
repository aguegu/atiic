// the CH341's I2C packets, no hardware
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKET_SIZE, CMD_I2C_STREAM, STM_STA, STM_STO, STM_OUT, STM_IN, STM_END,
  speedPacket, transaction, packets, uioPacket,
} from '../../src/adapters/ch341/protocol.js';
import Ch341 from '../../src/adapters/ch341/index.js';

const hexOf = (p) => Array.from(p.data, (b) => b.toString(16).padStart(2, '0')).join(' ');

describe('ch341 protocol', () => {
  it('sets the speed, 100 kHz by SET 1; refuses others', () => {
    assert.deepEqual(Array.from(speedPacket(100000)), [0xaa, 0x61, 0x00]);
    assert.throws(() => speedPacket(50000));
  });

  it('probes an address in one packet, its ack replied', () => {
    const [p, ...rest] = packets(transaction(0x68));
    assert.equal(rest.length, 0);
    assert.equal(hexOf(p), 'aa 74 80 d0 75 00');
    assert.equal(p.reply, 1);
    assert.deepEqual(p.acks, [0]);
  });

  it('writes a register: address acked, data by OUT n', () => {
    const [p] = packets(transaction(0x68, [0x6b, 0x00]));
    assert.equal(hexOf(p), 'aa 74 80 d0 82 6b 00 75 00');
    assert.equal(p.reply, 1);
  });

  it('reads 14 bytes after a register: repeated start, 13 acked, the last nacked', () => {
    const [p, ...rest] = packets(transaction(0x68, [0x3b], 14));
    assert.equal(rest.length, 0);
    assert.equal(hexOf(p), 'aa 74 80 d0 81 3b 74 80 d1 cd c0 75 00');
    assert.equal(p.reply, 2 + 14);
    assert.deepEqual(p.acks, [0, 1]);
  });

  it('a long read split across packets, no reply over a packet, no command split', () => {
    const ps = packets(transaction(0x68, [0x00], 100));
    let total = 0;
    for (const p of ps) {
      assert.equal(p.data[0], CMD_I2C_STREAM);
      assert.equal(p.data.at(-1), STM_END);
      assert.ok(p.data.length <= PACKET_SIZE);
      assert.ok(p.reply <= PACKET_SIZE);
      total += p.reply - p.acks.length;
    }
    assert.equal(total, 100);
    const cmds = ps.flatMap((p) => Array.from(p.data.slice(1, -1)));
    assert.equal(cmds[0], STM_STA);
    assert.equal(cmds.at(-1), STM_STO);
    assert.equal(cmds.at(-2), STM_IN); // the last byte nacked
  });

  it('a long write split across packets, every byte once, in order', () => {
    const bytes = Array.from({ length: 100 }, (_, i) => i);
    const ps = packets(transaction(0x3c, bytes));
    const written = [];
    for (const p of ps) {
      assert.ok(p.data.length <= PACKET_SIZE);
      const d = Array.from(p.data.slice(1, -1));
      for (let i = 0; i < d.length;) {
        if ((d[i] & 0xc0) === STM_OUT && d[i] !== STM_OUT) {
          const n = d[i] & 0x3f;
          written.push(...d.slice(i + 1, i + 1 + n));
          i += 1 + n;
        } else i += d[i] === STM_OUT ? 2 : 1;
      }
    }
    assert.deepEqual(written, bytes);
  });
});

describe('ch341 pins', () => {
  it('the UIO packet: levels and directions of D0-D5 (as flashrom drives them)', () => {
    assert.deepEqual(Array.from(uioPacket(0x01, 0x01)), [0xab, 0x81, 0x41, 0x20]); // D0 high, an output
    assert.deepEqual(Array.from(uioPacket(0x37, 0x3f)), [0xab, 0xb7, 0x7f, 0x20]); // flashrom's enable_pins
    assert.deepEqual(Array.from(uioPacket(0xff, 0xff)), [0xab, 0xbf, 0x7f, 0x20]); // D6 and D7 can't be driven
  });

  it('Ch341.pins(): each call sends all six, remembering the lines not named', async () => {
    const sent = [];
    const bus = new Ch341({ transferOut: async (ep, data) => { sent.push(Array.from(data)); return { status: 'ok', bytesWritten: data.length }; } });
    await bus.pins({ D0: true });
    await bus.pins({ D2: false });
    await bus.pins({ D0: null });
    assert.deepEqual(sent, [
      [0xab, 0x81, 0x41, 0x20], // D0 high
      [0xab, 0x81, 0x45, 0x20], // D2 low too, D0 still high
      [0xab, 0x81, 0x44, 0x20], // D0 released (its level bit kept, no longer driven)
    ]);
    assert.throws(() => bus.pins({ D7: true }), /no such pin D7/);
  });
});
