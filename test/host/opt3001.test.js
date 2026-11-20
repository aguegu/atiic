// the OPT3001 driver against a fake chip: Table 9's decodings, its set-up,
// CRF waited for, overflow, shutdown; and the INA231's check saying no to it
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Opt3001, Ina231 } from '../../src/index.js';
import { luxOf } from '../../src/devices/opt3001.js';

// ours, as read: its pointer ignores bit 7 (0xFE, 0xFF read the IDs)
class FakeOpt {
  constructor({ result = 0x0000, readyAfter = 0, flags = 0x0080 } = {}) {
    Object.assign(this, { result, readyAfter, flags });
    this.regs = { 0x01: 0xc810, 0x02: 0x0000, 0x03: 0xbfff, 0x7e: 0x5449, 0x7f: 0x3001 };
    this.log = [];
  }
  async write(address, bytes) {
    if (bytes.length === 3) { this.regs[bytes[0] & 0x7f] = (bytes[1] << 8) | bytes[2]; this.log.push(['write', ...bytes]); }
  }
  async writeRead(address, bytes) {
    const r = bytes[0] & 0x7f;
    let v = r === 0x00 ? this.result : this.regs[r] ?? 0;
    if (r === 0x01) v = (v & ~0x0180) | (this.readyAfter-- > 0 ? 0 : this.flags);
    return Uint8Array.of(v >> 8, v & 0xff);
  }
}

describe('opt3001 (host)', () => {
  it('Table 9: every example of its result register in lux', () => {
    for (const [word, lux] of [[0x0001, 0.01], [0x0fff, 40.95], [0x3456, 88.8], [0x789a, 2818.56], [0x8800, 5242.88], [0x9400, 5242.88], [0xa200, 5242.88], [0xb100, 5242.88], [0xb001, 20.48], [0xbfff, 83865.6]]) {
      assert.ok(Math.abs(luxOf(word) - lux) < 1e-6, `0x${word.toString(16)}: ${luxOf(word)}, not ${lux}`);
    }
  });

  it('init: automatic range, continuous, latched (0xCC10 at 800 ms, 0xC410 at 100 ms); the first conversion waited for', async () => {
    const f = new FakeOpt({ readyAfter: 2 });
    await new Opt3001(f).init();
    assert.deepEqual(f.log, [['write', 0x01, 0xcc, 0x10]]);
    const g = new FakeOpt();
    await new Opt3001(g, 0x44, { conversionMs: 100 }).init();
    assert.deepEqual(g.log, [['write', 0x01, 0xc4, 0x10]]);
    assert.throws(() => new Opt3001(g, 0x44, { conversionMs: 400 }), /no conversion time 400 ms: 100, 800/);
  });

  it('init throws if no conversion comes ready', async () => {
    await assert.rejects(new Opt3001(new FakeOpt({ readyAfter: 999 }), 0x44, { conversionMs: 100 }).init(), /no conversion ready/);
  });

  it('measure: lux and the overflow flag', async () => {
    assert.deepEqual(await new Opt3001(new FakeOpt({ result: 0x3456 })).measure(), { lux: 88.8, overflow: false });
    const over = await new Opt3001(new FakeOpt({ result: 0xbfff, flags: 0x0180 })).measure();
    assert.equal(over.overflow, true);
  });

  it('sleep: M back to shutdown, the rest kept, the read-only flags not written back', async () => {
    const f = new FakeOpt();
    const o = new Opt3001(f);
    await o.init();
    await o.sleep();
    assert.deepEqual(f.log.at(-1), ['write', 0x01, 0xc8, 0x10]);
  });

  it('identify: 0x5449 and 0x3001; and the INA231\'s check no longer takes it (0x3001 at 0xFF)', async () => {
    assert.equal(await Opt3001.chip.identify(new FakeOpt(), 0x44), true);
    const other = new FakeOpt();
    other.regs[0x7f] = 0x1050;
    assert.equal(await Opt3001.chip.identify(other, 0x44), false);
    assert.equal(await Ina231.chip.identify(new FakeOpt(), 0x44), false);
  });
});
