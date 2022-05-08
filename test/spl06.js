import chai from 'chai';
import config from 'config';
import { Spl06 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe.only('spl06', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'), null, 200);
    this.spl06 = new Spl06(adapter, config.get('slaves.spl06'));
  });

  it('should init', async function () {
    return this.spl06.init();
  });

  it('should measure', async function () {
    const { pressure, temperature } = await this.spl06.measure();
    temperature.should.be.a('number');
    pressure.should.be.a('number');
  });
});
