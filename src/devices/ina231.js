import _ from 'lodash';
import { i2hex } from '../utils.js';

class Ina231 {
  constructor(adapter, address = '40', resistorShunt = 0.1, currentLsb = 0.0001) {
    if (!Ina231.addresses.includes(address)) {
      throw new Error('invalid address');
    }
    this.adapter = adapter;
    this.address = address;
    this.resistorShunt = resistorShunt;
    this.currentLsb = currentLsb;
  }

  async init() {
    const cfg = await this.adapter.transmit(`AT+TR=${this.address}0002`);
    const calibration = _.round(0.00512 / this.currentLsb / this.resistorShunt);
    await this.adapter.transmit(`AT+TX=${this.address}05${i2hex(calibration >> 8)}${i2hex(calibration & 0xff)}`);
    await this.adapter.transmit(`AT+TR=${this.address}0502`).then(v => console.log(v.readUInt16BE()));
  }

  async measure() {
    const mvShunt = await this.adapter.transmit(`AT+TR=${this.address}0102`).then(v => _.round(v.readUInt16BE() * 0.0025, 4));
    const mvBus = await this.adapter.transmit(`AT+TR=${this.address}0202`).then(v => _.round(v.readUInt16BE() * 1.25, 2));
    const mwPower = await this.adapter.transmit(`AT+TR=${this.address}0302`).then(v => _.round(v.readUInt16BE() * 25 * this.currentLsb * 1000, 1));
    const maShunt = await this.adapter.transmit(`AT+TR=${this.address}0402`).then(v => _.round(v.readUInt16BE() * this.currentLsb * 1000, 1));
    return Promise.resolve({ mvShunt, mvBus, mwPower, maShunt });
  }
}

Ina231.addresses = _.range(0x40, 0x50).map(i2hex);

export default Ina231;
