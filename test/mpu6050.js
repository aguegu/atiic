import chai from 'chai';
import config from 'config';
import { Mpu6050 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('mpu6050', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Mpu6050(adapter);
  });

  it('should init', async function () {
    return this.device.init();
  });

  it('should measure', async function () {
    const light = await this.device.measure();

    console.log({ light });  
  });
});
