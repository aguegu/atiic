// the AGS2602 driver against a fake sensor built from its manual: a register
// written, then 4 data bytes and their CRC8 (initial 0xFF, polynomial 0x31)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ags2602 } from '../../src/index.js';
import { crc8, CONCENTRATION, VERSION, RESISTANCE } from '../../src/devices/ags2602.js';

// the registers as r8845's AGS2602 answered them (2026-11-14), CRCs included
const R8845 = {
  [VERSION]: [0x19, 0x09, 0x0d, 0x01, 0x0d],
  [RESISTANCE]: [0x00, 0x00, 0xfc, 0xe8, 0x03],
  [CONCENTRATION]: [0x00, 0x00, 0x00, 0x64, 0xa8],
};

class FakeAgs {
  constructor(regs = R8845) { this.regs = regs; this.reg = CONCENTRATION; this.log = []; }
  async write(address, bytes) { this.log.push(['write', address, ...bytes]); this.reg = bytes[0]; }
  async read(address, n) {
    this.log.push(['read', address, n]);
    return Uint8Array.from(this.regs[this.reg] ?? [0xff, 0xff, 0xff, 0xff, 0xff]);
  }
}

const withCrc = (d) => [...d, crc8(d)];

describe('ags2602 (host)', () => {
  it('crc8: the manual\'s (0xFF, 0x31) gives the CRCs r8845\'s sensor sent', () => {
    for (const r of Object.values(R8845)) assert.equal(crc8(r.slice(0, 4)), r[4]);
  });

  it('measure: register 0x00 written, 5 bytes read; Data2-4 the ppb, RDY 0 ready', async () => {
    const s = new FakeAgs();
    assert.deepEqual(await new Ags2602(s).measure(), { tvoc: 100, ready: true });
    assert.deepEqual(s.log, [['write', 0x1a, 0x00], ['read', 0x1a, 5]]);
  });

  it('measure: RDY set (warming up) reads not ready; 24-bit ppb, high byte first', async () => {
    const s = new FakeAgs({ [CONCENTRATION]: withCrc([0x01, 0x00, 0x75, 0x30]) });
    assert.deepEqual(await new Ags2602(s).measure(), { tvoc: 30000, ready: false });
  });

  it('resistance: register 0x20, x 10 ohm (r8845: 64744 -> 647440)', async () => {
    assert.equal(await new Ags2602(new FakeAgs()).resistance(), 647440);
    const big = new FakeAgs({ [RESISTANCE]: withCrc([0xff, 0xff, 0xff, 0xff]) });
    assert.equal(await new Ags2602(big).resistance(), 0xffffffff * 10); // unsigned
  });

  it('version: register 0x11, the four bytes as read', async () => {
    assert.deepEqual(await new Ags2602(new FakeAgs()).version(), [0x19, 0x09, 0x0d, 0x01]);
  });

  it('a bad CRC throws, naming the register', async () => {
    const s = new FakeAgs({ [CONCENTRATION]: [0x00, 0x00, 0x00, 0x64, 0x00] });
    await assert.rejects(new Ags2602(s).measure(), /AGS2602 CRC: 0x00 .* \(register 0x00\)/);
  });

  it('identify: the version with a good CRC; all 0xFF (nothing, or something else) not', async () => {
    assert.equal(await Ags2602.chip.identify(new FakeAgs(), 0x1a), true);
    assert.equal(await Ags2602.chip.identify(new FakeAgs({}), 0x1a), false);
  });

  it('another address; 0x1A by default, 100 kHz at most', async () => {
    const s = new FakeAgs();
    await new Ags2602(s, 0x1b).measure();
    assert.equal(s.log[0][1], 0x1b);
    assert.deepEqual(Ags2602.addresses, [0x1a]);
    assert.equal(Ags2602.chip.maxSclHz, 100000);
  });
});
