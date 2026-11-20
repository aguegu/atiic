// the ENS160 driver against a fake chip: its register map (16.1), the
// compensation formats' examples (16.2.5, 16.2.6, 16.2.12, 16.2.13), the
// standard mode's start, results, the validity flag, an error
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ens160, Adxl345 } from '../../src/index.js';
import { temperatureWord, humidityWord, OPMODE } from '../../src/devices/ens160.js';

class FakeEns {
  constructor({ readyAfter = 0, validity = 0, error = false } = {}) {
    Object.assign(this, { readyAfter, validity, error });
    this.mem = new Uint8Array(0x50);
    this.mem.set([0x60, 0x01], 0x00); // PART_ID 0x0160, LSB first
    this.mem[0x10] = OPMODE.idle;
    this.mem.set([0x8a, 0x4a, 0x00, 0x64], 0x30); // DATA_T, DATA_RH: its defaults, 25 C and 50 %
    this.mem.set([0x02, 0x2c, 0x01, 0x58, 0x02], 0x21); // AQI 2, TVOC 300 ppb, eCO2 600 ppm
    this.newdat = false;
    this.log = [];
  }
  async write(address, bytes) {
    this.log.push(['write', ...bytes]);
    const [r, ...data] = bytes;
    this.mem.set(data, r);
    if (r === 0x10 && data[0] === OPMODE.standard) this.newdat = true;
    if (r === 0x14) this.mem.set(this.mem.slice(0x13, 0x15), 0x30); // TEMP_IN taken on its MSB
    if (r === 0x16 || (r === 0x15 && data.length === 2)) this.mem.set(this.mem.slice(0x15, 0x17), 0x32);
    if (r === 0x13 && data.length === 2) this.mem.set(this.mem.slice(0x13, 0x15), 0x30);
  }
  async writeRead(address, bytes, n) {
    const r = bytes[0];
    if (r === 0x20) {
      const running = this.mem[0x10] === OPMODE.standard;
      const ready = running && this.newdat && this.readyAfter-- <= 0;
      return Uint8Array.of((running ? 0x80 : 0) | (this.error ? 0x40 : 0) | (this.validity << 2) | (ready ? 0x02 : 0));
    }
    if (r >= 0x21 && r <= 0x25) this.newdat = false; // cleared at the first DATA read
    return this.mem.slice(r, r + n);
  }
}

describe('ens160 (host)', () => {
  it('the compensation formats: the datasheet\'s examples (25 C 0x4A8A, 50 % 0x6400)', () => {
    assert.equal(temperatureWord(25), 0x4a8a);
    assert.equal(humidityWord(50), 0x6400);
  });

  it('identify: PART_ID 0x0160 LSB first; an ADXL345 (0xE5 at 0x00, at 0x53) is not one, nor is it an ADXL345', async () => {
    assert.equal(await Ens160.chip.identify(new FakeEns(), 0x52), true);
    const adxl = { async writeRead() { return Uint8Array.of(0xe5, 0x00); } };
    assert.equal(await Ens160.chip.identify(adxl, 0x53), false);
    const [id] = await new FakeEns().writeRead(0x53, [Adxl345.chip.idRegister], 1);
    assert.notEqual(id, Adxl345.chip.whoAmI);
    const nack = { async writeRead() { throw new Error('no ack'); } };
    assert.equal(await Ens160.chip.identify(nack, 0x52), false);
  });

  it('init: idle, then standard; its first data waited for by NEWDAT', async () => {
    const f = new FakeEns({ readyAfter: 3 });
    await new Ens160(f).init();
    assert.deepEqual(f.log, [['write', 0x10, 0x01], ['write', 0x10, 0x02]]);
  });

  it('init throws on STATER', async () => {
    await assert.rejects(new Ens160(new FakeEns({ error: true, readyAfter: 999 })).init(), /error \(status 0xc0\)/);
  });

  it('measure: AQI, TVOC, eCO2 in one read from 0x21; the validity flag; NEWDAT as fresh', async () => {
    const f = new FakeEns({ validity: 1 });
    const e = new Ens160(f);
    await e.init();
    assert.deepEqual(await e.measure(), { aqi: 2, tvoc: 300, eco2: 600, validity: 'warm-up', fresh: true });
    assert.equal((await e.measure()).fresh, false);
    f.validity = 0;
    assert.equal((await e.measure()).validity, 'ok');
    f.validity = 3;
    assert.equal((await e.measure()).validity, 'invalid');
  });

  it('compensate: TEMP_IN and RH_IN, LSB first, the MSB last; compensation() reads them back from DATA_T and DATA_RH', async () => {
    const f = new FakeEns();
    const e = new Ens160(f);
    assert.deepEqual(await e.compensation(), { temperature: 0x4a8a / 64 - 273.15, humidity: 50 });
    await e.compensate(25, 50);
    assert.deepEqual(f.log, [['write', 0x13, 0x8a, 0x4a], ['write', 0x15, 0x00, 0x64]]);
    await e.compensate(21.5, 40.25);
    const c = await e.compensation();
    assert.ok(Math.abs(c.temperature - 21.5) < 1 / 64, `${c.temperature}`);
    assert.equal(c.humidity, 40.25);
  });

  it('sleep: deep sleep (OPMODE 0x00)', async () => {
    const f = new FakeEns();
    await new Ens160(f).sleep();
    assert.deepEqual(f.log, [['write', 0x10, 0x00]]);
  });
});
