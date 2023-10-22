import _ from 'lodash';
import { crc8, i2hex, delay } from '../utils.js';

class Mlx90614 {
  constructor(adapter, address = '5A') {
    this.adapter = adapter;
    this.address = address;
    this.addressW = i2hex(parseInt(this.address, 16) << 1);
    this.addressR = i2hex((parseInt(this.address, 16) << 1) + 1);
  }

  async readCelsius(command) {
    const raw = await this.adapter.transmit(`AT+TR=${this.address}${command}03`);

    // const payload = Buffer.concat([Buffer.from(`${this.addressW}${command}${this.addressR}`, 'hex'), raw]);
    // const crc = i2hex(crc8(payload, 0x07, 0x00));
    // console.log({ payload, crc, pec: i2hex(raw.readUInt8(raw.length - 1) });

    const k = raw.readUInt16LE();
    if (k >= 0x8000) {
      return Promise.resolve(null);
    }
    return Promise.resolve(_.round(k * 0.02 - 273.15, 2));
  }

  async measure() {
    const ambient = await this.readCelsius('06');
    const target = await this.readCelsius('07');
    return Promise.resolve({ ambient, target });
  }

  async readEmissivity() {
    return this.adapter.transmit(`AT+TR=${this.address}2403`).then(v => v.readUInt16LE() / 0xffff);
  }

  async writeEmissivity(emissivity) {
    const pec = i2hex(crc8([parseInt(this.addressW, 16), 0x24, 0, 0], 0x07, 0x00));
    await this.adapter.transmit(`AT+TX=${this.address}240000${pec}`);
    await delay(20);

    const e = parseInt(0xffff * emissivity);
    const payload = [parseInt(this.addressW, 16), 0x24, e & 0xff, e >> 8];
    const pec2 = i2hex(crc8(payload, 0x07, 0x00));

    await this.adapter.transmit(`AT+TX=${this.address}${payload.slice(1).map(c => i2hex(c)).join('')}${pec2}`);
    await delay(20);
  }
}

export default Mlx90614;
