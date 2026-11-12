// a fake dart for the host tests (dart-protocol's, dart-ble's): a USBDevice
// that takes requests as the firmware does and answers from 256 registers
// at 0x52
import assert from 'node:assert/strict';
import { OP } from '../../src/adapters/dart/index.js';

const SLAVE = 0x52;

// a fake dart: the bytes of each request kept, replies built as the
// firmware's main.c does (op, tag, status, 0, count; data on OK)
export function fakeDart({ productName = 'dart', writable = 0x100, stale = null, protocol = 0x0100, held = null } = {}) {
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
      const ok = protocol >= 0x0101 ? hz >= 7327 && hz <= 400000 : hz === 100000 || hz === 400000;
      return reply(q, ok ? 0 : -18);
    }
    // held: the lines a device holds low (BUS_BUSY; a 1.1 dart's count the
    // lines read, a bit set when high: SCL 1, SDA 2; 1.0's count 0)
    const busy = () => reply(q, -4, [], protocol >= 0x0101 ? (held.includes('SCL') ? 0 : 1) | (held.includes('SDA') ? 0 : 2) : 0);
    if (held && (q[0] === OP.SCAN || q[0] === OP.I2C)) return busy();
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

