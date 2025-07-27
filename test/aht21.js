import chai from 'chai';
import config from 'config';
import { Aht21 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('aht21', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.aht21 = new Aht21(adapter);
  });

  it('should init', async function () {
    return this.aht21.init();
  });

  it('should measure', async function () {
    const { temperature, humidity } = await this.aht21.measure();
    temperature.should.be.a('number');
    humidity.should.be.a('number');
    console.log({ temperature, humidity });  
  });
});
