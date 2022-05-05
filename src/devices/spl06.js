import { delay } from '../utils.js';

class Spl06 {
  constructor(adapter, address = '76') {
    this.adapter = adapter;
    this.address = address;
    this.coefs = {};
  }

  async init() {
    const [id] = await this.adapter.transmit(`AT+TR=${this.address}0D01`);
    if (id !== 0x10) {
      throw new Error(`Device at adrress 0x${this.address} IS NOT SPL06`);
    }

    const [status] = await this.adapter.transmit(`AT+TR=${this.address}0801`); // read cfg
    if (!(status & 0x40)) {
      await this.adapter.transmit(`AT+TX=${this.address}0c89`); // soft reset
      await delay(40);
    }

    await this.adapter.transmit(`AT+TX=${this.address}0603`); // Pressure 8x sampling
    await this.adapter.transmit(`AT+TX=${this.address}0783`); // Temperature 8x sampling
    await this.adapter.transmit(`AT+TX=${this.address}0807`); // Temperature & Pressure
    await this.adapter.transmit(`AT+TX=${this.address}0900`); // CFG

    const coef = await this.adapter.transmit(`AT+TR=${this.address}1012`);
    this.coefs.c0 = coef.readInt16BE() >> 4;
    this.coefs.c1 = (coef.readInt32BE(1) << 4) >> 20;
    this.coefs.c00 = coef.readInt32BE(3) >> 12;
    this.coefs.c10 = (coef.readInt32BE(5) << 4) >> 12;
    this.coefs.c01 = coef.readInt16BE(0x08);
    this.coefs.c11 = coef.readInt16BE(0x0a);
    this.coefs.c20 = coef.readInt16BE(0x0c);
    this.coefs.c21 = coef.readInt16BE(0x0e);
    this.coefs.c30 = coef.readInt16BE(0x10);
  }

  async seed() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}0006`);
    const pRaw = payload.readInt32BE() >> 8;
    const tRaw = (payload.readInt32BE(2) << 8) >>> 8;

    const tSc = tRaw / 7864320;
    const pSc = pRaw / 7864320;

    const pressure = this.coefs.c00
      + pSc * (this.coefs.c10 + pSc * (this.coefs.c20 + pSc * this.coefs.c30))
      + tSc * this.coefs.c01 + tSc * pSc * (this.coefs.c11 + pSc * this.coefs.c21);
    const temperature = this.coefs.c0 * 0.5 + this.coefs.c1 * tSc;
    return Promise.resolve({ pressure, temperature });
  }
}

export default Spl06;
