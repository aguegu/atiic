import { crc8 } from '../utils.js';

class Ags10 {
  constructor(adapter) {
    this.adapter = adapter;
    this.address = '1A';
  }

  async init() {
    await this.adapter.transmit(`AT+FQ=000E`);
  }

  async deinit() {
    await this.adapter.transmit(`AT+FQ=0190`);
  }

  async version() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}1105`);
    if (crc8(payload)) {
      throw new Error('crc8 mismatch');
    }
    return polarity
  }

  async measure() {
    let payload = await this.adapter.transmit(`AT+TR=${this.address}0005`);
    if (crc8(payload)) {
      throw new Error('crc8 mismatch');
    }

    if (payload[0] & 0x01) {
      throw new Error('not ready');
    }

    const tvoc = payload.readUInt32BE() & 0xffffff;

    payload = await this.adapter.transmit(`AT+TR=${this.address}2005`);
    if (crc8(payload)) {
      throw new Error('crc8 mismatch');
    }

    const resistance = payload.readUInt32BE();

    return Promise.resolve({ tvoc, resistance });
  }
}

export default Ags10;
