import { should } from 'chai';
import config from 'config';
import { Sht20 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

should();

describe('sht20', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Sht20(adapter);
  });

  it('should init', async function () {
    return this.device.init();
  });

  it('should measure', async function () {
    // const { temperature, humidity } =
    await this.device.measure().then(console.log);
    // temperature.should.be.a('number');
    // humidity.should.be.a('number');
  });
});
