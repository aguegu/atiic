import config from 'config';
import { Ina231 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

describe('ina231', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Ina231(adapter);
  });

  it('should init', async function () {
    return this.device.init();
  });

  it('should measure', async function () {
    return this.device.measure().then(console.log);
  });
});
