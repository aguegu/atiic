import chai from 'chai';
import config from 'config';
import { Mpu6050 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('aht21', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Mpu6050(adapter);
  });

  it('should init', async function () {
    return this.device.init();
  });

  it('should measure', async function () {
    const { accelerometers, temperature, gyroscopes } = await this.device.measure();
    temperature.should.be.a('number');
    accelerometers.x.should.be.a('number');
    accelerometers.y.should.be.a('number');
    accelerometers.z.should.be.a('number');
    gyroscopes.x.should.be.a('number');
    gyroscopes.y.should.be.a('number');
    gyroscopes.z.should.be.a('number');
    console.log({ temperature, accelerometers, gyroscopes }); // eslint-disable-line no-console
  });
});
