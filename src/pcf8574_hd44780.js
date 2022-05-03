import _ from 'lodash';
import { delay } from './utils.js';

// P7: d7
// P6: d6
// P5: d5
// P4: d4
// P3: bl, backlight, if with jumper, 1/0: on/off
// P2: em
// P1: rw
// P0: rs

class Pcf8574Hd44780 {
  constructor(adapter, address = '27') {
    this.adapter = adapter;
    this.address = address;
    this.backlight = 0x08;
  }

  async init() {
    await this.emit(0x30);
    await delay(4.1);
    await this.emit(0x30);

    await delay(0.1);

    await this.emit(0x30);
    await this.emit(0x20);

    await this.transmitBuffer(Buffer.from([0x28, 0x08, 0x01]), 0);
    await this.transmitBuffer(Buffer.from([0x06, 0x02]), 0);
    await delay(1.520);
    await this.setDisplay({ display: true, cursor: false, blink: false, backlight: true });
  }

  async setDisplay({ display, cursor, blink, backlight }) {
    let dt = 0x08;
    dt |= display ? 0x04: 0x00;
    dt |= cursor ? 0x02: 0x00;
    dt |= blink ? 0x01: 0x00;
    this.backlight = backlight ? 0x08: 0x00;
    return this.write(dt);
  }

  async emit(dt) {
    const buff = Buffer.from([
      (dt & 0xf0) | 0x04 | this.backlight,
      (dt & 0xf0) | 0x00 | this.backlight,
    ]);

    return this.adapter.transmit(`AT+TX=${this.address}${buff.toString('hex')}`);
  }

  async write(dt, rs = 0x00) {
    const buff = Buffer.from([
      (dt & 0xf0) | 0x04 | rs | this.backlight,
      (dt & 0xf0) | 0x00 | rs | this.backlight,
      ((dt << 4) & 0xf0) | 0x04 | rs | this.backlight,
      ((dt << 4) & 0xf0) | 0x00 | rs | this.backlight,
    ]);
    return this.adapter.transmit(`AT+TX=${this.address}${buff.toString('hex')}`);
  }

  async setDDRam(address) {
    return this.write(0x80 + (address & 0x7f), 0);
  }

  async setCGRam(address, buff) {
    await this.write(0x40 + (address & 0x7f), 0);
    return this.transmitBuffer(buff);
  }

  async print(str) {
    return this.transmitBuffer(Buffer.from(Array.from(str).map(c => c.charCodeAt())));
  }

  async transmitBuffer(buff, rs = 0x01) {
    return _.chain(Array.from(buff)).map(dt => ([
        (dt & 0xf0) | 0x04 | rs | this.backlight,
        (dt & 0xf0) | rs | this.backlight,
        ((dt << 4) & 0xf0) | 0x04 | rs | this.backlight,
        ((dt << 4) & 0xf0) | rs | this.backlight,
      ])).flatten().chunk(24).value().reduce(async (prev, current) => {
        await prev;
        return this.adapter.transmit(`AT+TX=${this.address}${Buffer.from(current).toString('hex')}`);
      }, Promise.resolve());
  }
}

export default Pcf8574Hd44780;
