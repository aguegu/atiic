// the LM75 driver against a fake sensor: Table 4's codes, the limits both
// ways (negative too), the configuration, the power-up state, the range check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Lm75 } from '../../src/index.js';

// Dart-8346's LM75, as read (its config one byte)
class FakeLm75 {
  constructor(regs = {}) { this.regs = { 0x00: 0x1700, 0x01: 0x00, 0x02: 0x4b00, 0x03: 0x5000, ...regs }; this.pointer = 0; this.log = []; }
  async write(address, bytes) {
    this.pointer = bytes[0];
    if (bytes.length > 1) this.log.push(['write', ...bytes]);
    if (bytes.length === 2) this.regs[bytes[0]] = bytes[1];
    if (bytes.length === 3) this.regs[bytes[0]] = (bytes[1] << 8) | bytes[2];
  }
  async writeRead(address, bytes, n) {
    await this.write(address, bytes);
    const v = this.regs[this.pointer] ?? 0xffff;
    return this.pointer === 0x01 ? Uint8Array.of(v) : Uint8Array.of(v >> 8, v & 0xff).slice(0, n);
  }
}

describe('lm75 (host)', () => {
  it('Table 4: +125, +25, +0.5, 0, -0.5, -25, -55 C; D6-D0 ignored', async () => {
    for (const [code, c] of [[0x7d00, 125], [0x1900, 25], [0x0080, 0.5], [0x0000, 0], [0xff80, -0.5], [0xe700, -25], [0xc900, -55], [0x197f, 25]]) {
      assert.equal(await new Lm75(new FakeLm75({ 0x00: code })).temperature(), c, `0x${code.toString(16)}`);
    }
    assert.deepEqual(await new Lm75(new FakeLm75()).measure(), { temperature: 23 });
  });

  it('limits: the power-up 75 and 80 C; set both ways, to the 0.5 C step, negative too; out of range throws', async () => {
    const f = new FakeLm75();
    const t = new Lm75(f);
    assert.deepEqual(await t.limits(), { hysteresis: 75, overtemperature: 80 });
    await t.setLimits({ hysteresis: -10.5, overtemperature: 30.2 });
    assert.equal(f.regs[0x02], 0xf580); // -21 half-steps: 0x1EB, in D15-D7
    assert.deepEqual(await t.limits(), { hysteresis: -10.5, overtemperature: 30 });
    await assert.rejects(t.setLimits({ overtemperature: 130 }), /130 C outside -55 to 125 C/);
  });

  it('configure: shutdown, interrupt, OS active high, the fault queue; the rest kept; D7-D5 0', async () => {
    const f = new FakeLm75({ 0x01: 0x00 });
    const t = new Lm75(f);
    await t.configure({ faultQueue: 6, activeHigh: true });
    assert.equal(await t.config(), 0x18 | 0x04);
    await t.configure({ shutdown: true, interrupt: true });
    assert.equal(await t.config(), 0x18 | 0x04 | 0x02 | 0x01);
    await t.configure({ shutdown: false });
    assert.equal(await t.config(), 0x18 | 0x04 | 0x02);
    await assert.rejects(t.configure({ faultQueue: 3 }), /no fault queue 3: 1, 2, 4, 6/);
  });

  it('init: the power-up state back, configuration 0, 75 and 80 C', async () => {
    const f = new FakeLm75({ 0x01: 0x1e, 0x03: 0x2d00 }); // T_OS as an SHT3x\'s check left ours
    await new Lm75(f).init();
    assert.deepEqual(f.log, [['write', 0x01, 0x00], ['write', 0x02, 0x4b, 0x00], ['write', 0x03, 0x50, 0x00]]);
  });

  it('identify: configuration D7-D5 clear and three temperatures in range; else no', async () => {
    assert.equal(await Lm75.chip.identify(new FakeLm75(), 0x48), true);
    assert.equal(await Lm75.chip.identify(new FakeLm75({ 0x01: 0x80 }), 0x48), false);
    assert.equal(await Lm75.chip.identify(new FakeLm75({ 0x03: 0x7f80 }), 0x48), false); // 127.5 C
    const nack = new FakeLm75();
    nack.writeRead = async () => { throw new Error('no ack from 0x48'); };
    assert.equal(await Lm75.chip.identify(nack, 0x48), false);
  });
});
