// the SGP40 driver against a fake sensor: Table 7's CRC, Table 10's
// parameters, its commands, the self test, the serial number, a NACK while busy
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Sgp40 } from '../../src/index.js';
import { crc8, parameters } from '../../src/devices/sgp40.js';

const w = (v) => [v >> 8, v & 0xff, crc8([v >> 8, v & 0xff])];

class FakeSgp {
  constructor({ raw = 30000, test = 0xd400, serial = [0x0000, 0x0123, 0x4567], busy = 0 } = {}) {
    Object.assign(this, { raw, test, serial, busy });
    this.log = [];
    this.reply = null;
  }
  async write(address, bytes) {
    this.log.push(bytes);
    const c = (bytes[0] << 8) | bytes[1];
    this.reply = { 0x260f: w(this.raw), 0x280e: w(this.test), 0x3682: this.serial.flatMap(w) }[c] ?? null;
  }
  async read(address, n) {
    if (this.busy-- > 0) throw new Error(`no ack from 0x${address.toString(16)}`);
    return Uint8Array.from(this.reply.slice(0, n));
  }
}

describe('sgp40 (host)', () => {
  it('crc8: Table 7 (CRC(0xBEEF) = 0x92), Table 10\'s defaults and limits', () => {
    assert.equal(crc8([0xbe, 0xef]), 0x92);
    assert.equal(crc8([0x80, 0x00]), 0xa2);
    assert.equal(crc8([0x66, 0x66]), 0x93);
    assert.equal(crc8([0x00, 0x00]), 0x81);
    assert.equal(crc8([0xff, 0xff]), 0xac);
  });

  it('parameters: Table 10, the defaults (50 %, 25 C) 0x8000 0xA2 0x6666 0x93, the limits, clamped past them', () => {
    assert.deepEqual(parameters(), [0x80, 0x00, 0xa2, 0x66, 0x66, 0x93]);
    assert.deepEqual(parameters(0, -45), [0x00, 0x00, 0x81, 0x00, 0x00, 0x81]);
    assert.deepEqual(parameters(100, 130), [0xff, 0xff, 0xac, 0xff, 0xff, 0xac]);
    assert.deepEqual(parameters(120, 200), parameters(100, 130));
  });

  it('measure: 0x26 0x0F with the defaults (compensation off), or a reading\'s RH and T; the raw word', async () => {
    const f = new FakeSgp({ raw: 31234 });
    const s = new Sgp40(f);
    assert.deepEqual(await s.measure(), { raw: 31234 });
    assert.deepEqual(f.log[0], [0x26, 0x0f, 0x80, 0x00, 0xa2, 0x66, 0x66, 0x93]);
    await s.measure({ humidity: 0, temperature: -45 });
    assert.deepEqual(f.log[1], [0x26, 0x0f, 0x00, 0x00, 0x81, 0x00, 0x00, 0x81]);
  });

  it('measure: a NACK while busy is asked again; a bad CRC throws', async () => {
    assert.deepEqual(await new Sgp40(new FakeSgp({ busy: 2 })).measure(), { raw: 30000 });
    const f = new FakeSgp();
    f.write = async function write() { this.reply = [0x75, 0x30, 0x00]; };
    await assert.rejects(new Sgp40(f).measure(), /SGP40 measurement CRC/);
  });

  it('selfTest: 0xD4xx passed, 0x4Bxx failed', async () => {
    assert.deepEqual(await new Sgp40(new FakeSgp({ test: 0xd400 })).selfTest(), { passed: true, result: 0xd400 });
    assert.equal((await new Sgp40(new FakeSgp({ test: 0x4b00 })).selfTest()).passed, false);
  });

  it('serial: three words, 48 bits; identify by their CRCs', async () => {
    assert.equal(await new Sgp40(new FakeSgp({ serial: [0x0001, 0x0203, 0x0405] })).serial(), 0x000102030405);
    assert.equal(await Sgp40.chip.identify(new FakeSgp(), 0x59), true);
    const bad = new FakeSgp();
    bad.serial = [0, 0, 0];
    bad.write = async function write() { this.reply = [0, 0, 0x81, 0, 0, 0x81, 0, 0, 0x00]; };
    assert.equal(await Sgp40.chip.identify(bad, 0x59), false);
    const nack = { async write() { throw new Error('no ack'); } };
    assert.equal(await Sgp40.chip.identify(nack, 0x59), false);
  });

  it('sleep: heater off (0x36 0x15)', async () => {
    const f = new FakeSgp();
    await new Sgp40(f).sleep();
    assert.deepEqual(f.log, [[0x36, 0x15]]);
  });
});
