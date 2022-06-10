import { i2hex, delay } from '../utils.js';

class Bh1750 {
  constructor(adapter, address = '23') {
    this.adapter = adapter;
    this.address = address; // '23' or '5c'
    this.waiting = 120;
  }

  async init(mode) {
    await this.adapter.transmit(`AT+TX=${this.address}${i2hex(mode)}`);
    await this.setMeasureTime(69);
    this.waiting = [
      Bh1750.modes.continuousLowResMode,
      Bh1750.modes.oneTimeLowResMode,
    ].includes(mode) ? 16 : 120;
  }

  async setMeasureTime(mt) {
    const dt = [0x40, 0x60];
    dt[0] |= (mt >> 5);
    dt[1] |= mt & 0x1f;
    return this.adapter.transmit(`AT+TX=${this.address}${dt.map(i2hex).join('')}`);
  }

  async measure() {
    await delay(this.waiting);
    const payload = await this.adapter.transmit(`AT+TR=${this.address}02`);
    return payload.readUInt16BE() / 1.2;
  }
}

Bh1750.modes = {
  continuousHighResMode: 0x10,
  continuousHighResMode2: 0x11,
  continuousLowResMode: 0x13,
  oneTimeHighResMode: 0x20,
  oneTimeHighResMode2: 0x21,
  oneTimeLowResMode: 0x23,
};

export default Bh1750;
