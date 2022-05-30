import { delay } from '../utils.js';

class Bme280 {
  constructor(adapter, address) {
    this.adapter = adapter;
    this.address = address;
    this.coefs = {};
  }

  async init() {
    const [id] = await this.adapter.transmit(`AT+TR=${this.address}d001`);
    if (id !== 0x60) {
      throw new Error(`Device at address 0x${this.address} IS NOT BME280`);
    }

    await this.adapter.transmit(`AT+TX=${this.address}e0b6`); // reset
    await delay(100);
    const calib0 = await this.adapter.transmit(`AT+TR=${this.address}881a`);
    const calib1 = await this.adapter.transmit(`AT+TR=${this.address}e107`);

    this.coefs.dig_t1 = calib0.readUInt16LE(0);
    this.coefs.dig_t2 = calib0.readInt16LE(2);
    this.coefs.dig_t3 = calib0.readInt16LE(4);
    this.coefs.dig_p1 = calib0.readUInt16LE(6);
    this.coefs.dig_p2 = calib0.readInt16LE(8);
    this.coefs.dig_p3 = calib0.readInt16LE(10);
    this.coefs.dig_p4 = calib0.readInt16LE(12);
    this.coefs.dig_p5 = calib0.readInt16LE(14);
    this.coefs.dig_p6 = calib0.readInt16LE(16);
    this.coefs.dig_p7 = calib0.readInt16LE(18);
    this.coefs.dig_p8 = calib0.readInt16LE(20);
    this.coefs.dig_p9 = calib0.readInt16LE(22);
    this.coefs.dig_h1 = calib0.readUInt8(25);
    this.coefs.dig_h2 = calib1.readInt16LE(0);
    this.coefs.dig_h3 = calib1.readUInt8(2);
    this.coefs.dig_h4 = (calib1.readInt8(3) << 4) + (calib1.readUInt8(4) & 0x0f);
    this.coefs.dig_h5 = (calib1.readInt8(5) << 4) + (calib1.readUInt8(4) >> 4);
    this.coefs.dig_h6 = calib1.readInt8(6);

    await this.adapter.transmit(`AT+TX=${this.address}f400`); // ctrl_mes: Sleep mode
    await this.adapter.transmit(`AT+TX=${this.address}f205`); // ctrl_hum: humidity oversampling x16
    await this.adapter.transmit(`AT+TX=${this.address}f500`); // config: standby 0.5ms
    await this.adapter.transmit(`AT+TX=${this.address}f4b7`); // ctrl_mes: temperature oversampling x16, pressure oversampling x16

    await delay(100);
  }

  async measure() {
    const payload = await this.adapter.transmit(`AT+TR=${this.address}f708`);
    const tAdc = (payload[3] << 12) + (payload[4] << 4) + (payload[5] >> 4);
    const pAdc = (payload[0] << 12) + (payload[2] << 4) + (payload[3] >> 4);
    const hAdc = payload.readUInt16BE(6);
    let temperature; let pressure; let
      humidity;
    let tFine;
    (() => {
      const var1 = ((tAdc >> 3) - (this.coefs.dig_t1 << 1)) * this.coefs.dig_t2 >> 11;
      let var2 = (tAdc >> 4) - this.coefs.dig_t1;
      var2 = (((var2 * var2) >> 12) * this.coefs.dig_t3) >> 14;
      tFine = var1 + var2;
      temperature = ((tFine * 5 + 128) >> 8) / 100;
    })();
    (() => {
      let var1 = (tFine >> 1) - 64000;
      let var2 = (((var1 >> 2) * (var1 >> 2)) >> 11) * this.coefs.dig_p6;
      var2 += ((var1 * this.coefs.dig_p5) << 1);
      var2 = (var2 >> 2) + (this.coefs.dig_p4 << 16);
      var1 = ((this.coefs.dig_p3 * ((var1 >> 2) * (var1 >> 2) >> 13) >> 3)
        + (this.coefs.dig_p2 * var1 >> 1)) >> 18;
      var1 = (32768 + var1) * this.coefs.dig_p1 >> 15;
      if (var1 === 0) {
        return;
      }
      const p = parseInt(((1048576 - pAdc - (var2 >> 12)) * 3125) / var1, 10);
      var1 = (this.coefs.dig_p9 * ((((p >> 2) * (p >> 2)) >> 13))) >> 12;
      var2 = ((p >> 1) * this.coefs.dig_p8) >> 13;
      pressure = (p << 1) + ((var1 + var2 + this.coefs.dig_p7) >> 4);
    })();
    (() => {
      const var1 = tFine - 76800;
      const var2 = (((hAdc << 14)
        - (this.coefs.dig_h4 << 20) - this.coefs.dig_h5 * var1) + 16384) >> 15;
      const var3 = ((((var1 * this.coefs.dig_h6) >> 10) * (((var1 * this.coefs.dig_h3) >> 11)
        + 32768)) >> 10) + 2097152;
      const var4 = var2 * (((var3 * this.coefs.dig_h2) + 8192) >> 14);
      const var5 = ((var4 >> 15) * (var4 >> 15)) >> 7;
      let v2 = var4 - ((var5 * this.coefs.dig_h1) >> 4);
      v2 = v2 < 0 ? 0 : v2;
      v2 = v2 > 419430400 ? 419430400 : v2;
      humidity = (v2 >> 12) / 102400;
    })();

    return Promise.resolve({ temperature, pressure, humidity });
  }
}

export default Bme280;
