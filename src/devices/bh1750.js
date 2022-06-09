import { i2hex, delay } from '../utils.js';

class Bh1750 {
  constructor(adapter, address = '23') {
    this.adapter = adapter;
    this.address = address; // '23' or '5c'
  }

  async init(mode = '10') {
    await this.adapter.transmit(`AT+TX=${this.address}10`);
    await this.setMeasureTime(69);

    await this.adapter.transmit(`AT+TX=${this.address}${mode}`);
  }

  async setMeasureTime(mt) {
    const dt = [0x40, 0x60];
    dt[0] |= (mt >> 5);
    dt[1] |= mt & 0x1f;
    return this.adapter.transmit(`AT+TX=${this.address}${dt.map(i2hex).join('')}`);
  }

  async measure() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}02`);
    await delay(120);
    return payload.readUInt16BE() / 1.2;
  }
}

export default Bh1750;
