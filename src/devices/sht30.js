import { crc8 } from '../utils.js';

class Sht30 {
  constructor(adapter, address) {
    this.adapter = adapter;
    this.address = address;
  }

  async init() {
    return this.adapter.transmit(`AT+TX=${this.address}30A2`);
  }

  async measure() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}2c0d06`);
    if (crc8(payload.slice(0, 3)) || crc8(payload.slice(3, 6))) {
      throw new Error('crc8 mismatch');
    }

    return Promise.resolve({
      temperature: -45 + (175 * payload.readUInt16BE()) / 65535,
      humidity: (100 * payload.readUInt16BE(3)) / 65535,
    });
  }
}

export default Sht30;
