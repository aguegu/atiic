import _ from 'lodash';
import { i2hex, delay } from '../utils.js';

class Ssd1306 {
  constructor(adapter, height = 128) {
    this.adapter = adapter;
    this.height = height;
    this.address = '3C';
  }

  async command(data) {
    // return this.adapter.transmit(`AT+TX=${this.address}00${data.map(i2hex).join('')}`);
    return this.adapter.transmit(`AT+TR=${this.address}00${data.map(i2hex).join('')}00`);
  }

  async data(data) {
    // return this.adapter.transmit(`AT+TX=${this.address}40${data.map(i2hex).join('')}`);
    return this.adapter.transmit(`AT+TR=${this.address}40${data.map(i2hex).join('')}00`);
  }

  async init() {
    // await this.command([
    //   0xAE,
    //   0x81, 0xff,
    //
    //   0xAF,
    // ]); /*display off*/
    await this.command([0xAE]); /*display off*/
    // await this.command([0x00]); /*set lower column address*/
    // await this.command([0x10]); /*set higher column address*/
    // await this.command([0x00]); /*set display start line*/
    // await this.command([0xB0]); /*set page address*/
    await this.command([0x81, 0x80]); /*contract control*/
    // await this.command([0xA1]); /*set segment remap*/
    // await this.command([0xA6]); /*normal / reverse*/
    await this.command([0xA8, this.height - 1]); /*multiplex ratio*/
    // await this.command([0xC8]); /*Com scan direction*/
    await this.command([0xD3, 0x00]); /*set display offset*/

    await this.command([0xD5, 0x80]); /*set osc division*/

    await this.command([0xD9, 0x1f]); /*set pre-charge period*/

    await this.command([0xDA, 0x00]); /*set COM pins*/

    await this.command([0xDB, 0x40]); /*set vcomh*/

    await this.command([0x8D, 0x14]); /*set charge pump enable*/

    await this.command([0xA6]); // Display: A6: normal, A7: inverse
    await this.command([0xC0]); // COM Direction: C0: low to high, C1: high to low
    await this.command([0xA0]); // Segment mapping: A0: low to high, A1: high to low

    await this.command([0xAF]);

    await delay(100);
  }

  async clear(dt = 0x00) {
    await this.command([0x00]);
    await this.command([0x10]);

    return _.range(this.height / 8).reduce(async (prevPromise, v) => {
      await prevPromise;
      await this.command([0xb0 + v]);
      await this.data(_.times(64, _.constant(dt)));
      await this.data(_.times(64, _.constant(dt)));
    }, Promise.resolve());
  }
}

// void OLED_Set_Pos(u8 x, u8 y)
// {
// 	OLED_WR_Byte(0xb0+y,OLED_CMD);
// 	OLED_WR_Byte(((x&0xf0)>>4)|0x10,OLED_CMD);
// 	OLED_WR_Byte((x&0x0f),OLED_CMD);
// }

export default Ssd1306;
