import chai from 'chai';
import config from 'config';
import { Bh1750 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('bh1750', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Bh1750(adapter);
  });

  it('should init', async function () {
    await this.device.init(Bh1750.modes.continuousHighResMode);
    await this.device.setMeasureTime(69);
  });

  it('should measure', async function () {
    const light = await this.device.measure();
    console.log({ light });  
  });
});
