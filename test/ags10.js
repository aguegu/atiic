import config from 'config';
import { Ags10 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

describe('ags10', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Ags10(adapter);
    await this.device.init();
  });

  it.skip('should get version', async function() {
    return this.device.version();
  });

  it('should measure', async function() {
    const { tvoc, resistance } = await this.device.measure();
    console.log({ tvoc, resistance });
  });

  after(async function () {
    return this.device.deinit();
  });
});
