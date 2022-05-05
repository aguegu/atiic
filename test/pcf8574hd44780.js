import { delay } from '../src/utils.js';
import Lcd from '../src/devices/pcf8574_hd44780.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

describe.skip('pcf8574_hd44780', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(
      '/dev/ttyUSB0',
      console,
      200,
    );
    this.lcd = new Lcd(adapter);
  });

  it('should init', async function () {
    return this.lcd.init();
  });

  it('should print Hello1', async function () {
    this.timeout(10000);
    await this.lcd.setDDRam(0);
    await this.lcd.print('Liquid Crystal');
    await this.lcd.setDDRam(0x40);
    await this.lcd.print('1602 on Atiic');
    await delay(2000);
  });

  it('should print Hello', async function () {
    await this.lcd.clear();
    await this.lcd.setDDRam(0);
    await this.lcd.print('Follow @BG5USN');
  });

  it('should print CG RAM', async function () {
    await this.lcd.setCGRam(0, Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 00000000
      0x1f, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 11000000
      0x00, 0x00, 0x00, 0x1f, 0x1f, 0x00, 0x00, 0x00, // 00011000
      0x1f, 0x1f, 0x00, 0x1f, 0x1f, 0x00, 0x00, 0x00, // 11011000
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f, 0x1f, // 00000011
      0x1f, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x1f, 0x1f, // 11000011
      0x00, 0x00, 0x00, 0x1f, 0x1f, 0x00, 0x1f, 0x1f, // 00011011
      0x1f, 0x1f, 0x00, 0x1f, 0x1f, 0x00, 0x1f, 0x1f, // 11011011
    ]));
    await this.lcd.setDDRam(0x40);
    await this.lcd.transmitBuffer(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
  });
});
