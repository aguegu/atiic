import chai from 'chai';
import config from 'config';
import Ssd1306 from '../src/devices/ssd1306.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('Ssd1306', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'), null, 200);
    this.ssd1306 = new Ssd1306(adapter, 64);
  });

  it('should init', async function () {
    return this.ssd1306.init();
  });

  it('should clear', async function () {
    // return this.ssd1306.clear(0x00);
    return this.ssd1306.clear(0xff);
  });
});
