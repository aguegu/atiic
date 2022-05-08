import chai from 'chai';
import config from 'config';
import Sht30 from '../src/devices/sht30.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('sht30', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'), null, 200);
    this.sht30 = new Sht30(adapter, config.get('slaves.sht30'));
  });

  it('should init', async function () {
    return this.sht30.init();
  });

  it('should measure', async function () {
    const { temperature, humidity } = await this.sht30.measure();
    temperature.should.be.a('number');
    humidity.should.be.a('number');
  });
});
