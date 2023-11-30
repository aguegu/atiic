import chai from 'chai';
import config from 'config';
import { Mlx90614 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('Mlx90614', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Mlx90614(adapter);
  });

  it('should measure', async function () {
    const result = await this.device.measure();
    console.log(result);
  });

  it('should read Emissivity', async function () {
    const result = await this.device.readEmissivity();
    console.log(result);
  });

  it('should write Emissivity', async function () {
    await this.device.writeEmissivity(0.75);
    let result = await this.device.readEmissivity();
    result.should.closeTo(0.75, 0.01);

    await this.device.writeEmissivity(1);
    result = await this.device.readEmissivity();
    result.should.equal(1);
  });
});
