import { i2hex, delay } from '../utils.js';

const DEFAULT_CONFIGURATION = [
  0x00, /* 0x2d : set bit 2 and 5 to 1 for fast plus mode (1MHz I2C), else don't touch */
  0x01, /* 0x2e : bit 0 if I2C pulled up at 1.8V, else set bit 0 to 1 (pull up at AVDD) */
  0x01, /* 0x2f : bit 0 if GPIO pulled up at 1.8V, else set bit 0 to 1 (pull up at AVDD) */
  0x01, /* 0x30 : set bit 4 to 0 for active high interrupt and 1 for active low (bits 3:0 must be 0x1), use SetInterruptPolarity() */
  0x02, /* 0x31 : bit 1 = interrupt depending on the polarity, use CheckForDataReady() */
  0x00, /* 0x32 : not user-modifiable */
  0x02, /* 0x33 : not user-modifiable */
  0x08, /* 0x34 : not user-modifiable */
  0x00, /* 0x35 : not user-modifiable */
  0x08, /* 0x36 : not user-modifiable */
  0x10, /* 0x37 : not user-modifiable */
  0x01, /* 0x38 : not user-modifiable */
  0x01, /* 0x39 : not user-modifiable */
  0x00, /* 0x3a : not user-modifiable */
  0x00, /* 0x3b : not user-modifiable */
  0x00, /* 0x3c : not user-modifiable */
  0x00, /* 0x3d : not user-modifiable */
  0xff, /* 0x3e : not user-modifiable */
  0x00, /* 0x3f : not user-modifiable */
  0x0F, /* 0x40 : not user-modifiable */
  0x00, /* 0x41 : not user-modifiable */
  0x00, /* 0x42 : not user-modifiable */
  0x00, /* 0x43 : not user-modifiable */
  0x00, /* 0x44 : not user-modifiable */
  0x00, /* 0x45 : not user-modifiable */
  0x20, /* 0x46 : interrupt configuration 0->level low detection, 1-> level high, 2-> Out of window, 3->In window, 0x20-> New sample ready , TBC */
  0x0b, /* 0x47 : not user-modifiable */
  0x00, /* 0x48 : not user-modifiable */
  0x00, /* 0x49 : not user-modifiable */
  0x02, /* 0x4a : not user-modifiable */
  0x0a, /* 0x4b : not user-modifiable */
  0x21, /* 0x4c : not user-modifiable */
  0x00, /* 0x4d : not user-modifiable */
  0x00, /* 0x4e : not user-modifiable */
  0x05, /* 0x4f : not user-modifiable */
  0x00, /* 0x50 : not user-modifiable */
  0x00, /* 0x51 : not user-modifiable */
  0x00, /* 0x52 : not user-modifiable */
  0x00, /* 0x53 : not user-modifiable */
  0xc8, /* 0x54 : not user-modifiable */
  0x00, /* 0x55 : not user-modifiable */
  0x00, /* 0x56 : not user-modifiable */
  0x38, /* 0x57 : not user-modifiable */
  0xff, /* 0x58 : not user-modifiable */
  0x01, /* 0x59 : not user-modifiable */
  0x00, /* 0x5a : not user-modifiable */
  0x08, /* 0x5b : not user-modifiable */
  0x00, /* 0x5c : not user-modifiable */
  0x00, /* 0x5d : not user-modifiable */
  0x01, /* 0x5e : not user-modifiable */
  0xdb, /* 0x5f : not user-modifiable */
  0x0f, /* 0x60 : not user-modifiable */
  0x01, /* 0x61 : not user-modifiable */
  0xf1, /* 0x62 : not user-modifiable */
  0x0d, /* 0x63 : not user-modifiable */
  0x01, /* 0x64 : Sigma threshold MSB (mm in 14.2 format for MSB+LSB), use SetSigmaThreshold(), default value 90 mm  */
  0x68, /* 0x65 : Sigma threshold LSB */
  0x00, /* 0x66 : Min count Rate MSB (MCPS in 9.7 format for MSB+LSB), use SetSignalThreshold() */
  0x80, /* 0x67 : Min count Rate LSB */
  0x08, /* 0x68 : not user-modifiable */
  0xb8, /* 0x69 : not user-modifiable */
  0x00, /* 0x6a : not user-modifiable */
  0x00, /* 0x6b : not user-modifiable */
  0x00, /* 0x6c : Intermeasurement period MSB, 32 bits register, use SetIntermeasurementInMs() */
  0x00, /* 0x6d : Intermeasurement period */
  0x0f, /* 0x6e : Intermeasurement period */
  0x89, /* 0x6f : Intermeasurement period LSB */
  0x00, /* 0x70 : not user-modifiable */
  0x00, /* 0x71 : not user-modifiable */
  0x00, /* 0x72 : distance threshold high MSB (in mm, MSB+LSB), use SetD:tanceThreshold() */
  0x00, /* 0x73 : distance threshold high LSB */
  0x00, /* 0x74 : distance threshold low MSB ( in mm, MSB+LSB), use SetD:tanceThreshold() */
  0x00, /* 0x75 : distance threshold low LSB */
  0x00, /* 0x76 : not user-modifiable */
  0x01, /* 0x77 : not user-modifiable */
  0x0f, /* 0x78 : not user-modifiable */
  0x0d, /* 0x79 : not user-modifiable */
  0x0e, /* 0x7a : not user-modifiable */
  0x0e, /* 0x7b : not user-modifiable */
  0x00, /* 0x7c : not user-modifiable */
  0x00, /* 0x7d : not user-modifiable */
  0x02, /* 0x7e : not user-modifiable */
  0xc7, /* 0x7f : ROI center, use SetROI() */
  0xff, /* 0x80 : XY ROI (X=Width, Y=Height), use SetROI() */
  0x9B, /* 0x81 : not user-modifiable */
  0x00, /* 0x82 : not user-modifiable */
  0x00, /* 0x83 : not user-modifiable */
  0x00, /* 0x84 : not user-modifiable */
  0x01, /* 0x85 : not user-modifiable */
  0x00, /* 0x86 : clear interrupt, use ClearInterrupt() */
  0x00, /* 0x87 : start ranging, use StartRanging() or StopRanging(), If you want an automatic start after VL53L1X_init() call, put 0x40 in location 0x87 */
];

class Vl53l1x {
  constructor(adapter, address = '29') {
    this.adapter = adapter;
    this.address = address;
  }

  async isDataReady() {
    const interruptPolarity = await this.adapter.transmit(`AT+TR=${this.address}003001`).then((s) => !(s.readUInt8() & 0x10)); // GPIO_HV_MUX__CTRL
    return this.adapter.transmit(`AT+TR=${this.address}003101`).then((s) => !!(s.readUInt8() & 0x01) && interruptPolarity); // GPIO__TIO_HV_STATUS
  }

  async clearInterrupt() {
    return this.adapter.transmit(`AT+TX=${this.address}008601`); // SYSTEM__INTERRUPT_CLEAR
  }

  async startRanging() {
    await this.clearInterrupt();
    await this.adapter.transmit(`AT+TX=${this.address}008740`); // SYSTEM__MODE_START
  }

  async init() {
    const id = await this.adapter.transmit(`AT+TR=${this.address}010f02`); // Sensor ID
    if (!['eacc', 'ebaa'].includes(id.toString('hex'))) {
      throw new Error(`Device at adrress 0x${this.address} IS NOT V53L`);
    }
    await DEFAULT_CONFIGURATION.reduce(async (prevPromise, v, i) => {
      await prevPromise;
      return this.adapter.transmit(`AT+TX=${this.address}00${i2hex(i + 0x2D)}${i2hex(v)}`); // Sensor ID
    }, Promise.resolve());

    return this.getReady();
  }

  async waitForDataReady() {
    return this.isDataReady().then((isReady) => (isReady ? Promise.resolve() : this.waitForDataReady()));
  }

  async getReady() {
    await this.startRanging();

    await this.waitForDataReady();
    await this.clearInterrupt();
    await this.adapter.transmit(`AT+TX=${this.address}008700`); // SYSTEM__MODE_START off
    await this.adapter.transmit(`AT+TX=${this.address}000809`);
    await this.adapter.transmit(`AT+TX=${this.address}000B00`);
  }

  async measureRegular() {
    await this.startRanging();
    await this.waitForDataReady();

    const distance = await this.adapter.transmit(`AT+TR=${this.address}009602`).then((s) => s.readUInt16BE());

    await this.clearInterrupt();
    await this.adapter.transmit(`AT+TX=${this.address}008700`); // SYSTEM__MODE_START off

    return Promise.resolve({ distance });
  }

  async measure() {
    await this.clearInterrupt();
    await this.adapter.transmit(`AT+TX=${this.address}008710`); // SYSTEM__MODE_START oneShot

    // const start = Date.now();
    // await this.waitForDataReady();
    // console.log({ waited: Date.now() - start })
    await delay(0x70);
    const distance = await this.adapter.transmit(`AT+TR=${this.address}009602`).then((s) => s.readUInt16BE());
    return Promise.resolve({ distance });
  }
}

export default Vl53l1x;
