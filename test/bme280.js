import { should } from 'chai';
import config from 'config';
import { Bme280 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

should();

describe('bme280', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.bme280 = new Bme280(adapter, config.get('slaves.bme280'));
  });

  it('should init', async function () {
    return this.bme280.init();
  });

  it('should measure', async function () {
    const { temperature, pressure, humidity } = await this.bme280.measure();
    temperature.should.be.a('number');
    pressure.should.be.a('number');
    humidity.should.be.a('number');
    console.log({ temperature, pressure, humidity });  
  });
});
