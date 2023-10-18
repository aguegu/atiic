import chai from 'chai';
import config from 'config';
import { Jx90614 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('jx90614', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.jx90614 = new Jx90614(adapter);
  });

  it('should init', async function () {
    return this.jx90614.init();
  });

  it('should change slave address', async function () {
    await this.jx90614.setSlaveAddress('5A');
  });

  it('should measure', async function () {
    let temperature;
    ({ temperature } = await this.jx90614.measure());
    console.log({ temperature }); // eslint-disable-line no-console

    ({ temperature } = await this.jx90614.measure());
    console.log({ temperature }); // eslint-disable-line no-console

    ({ temperature } = await this.jx90614.measure());
    console.log({ temperature }); // eslint-disable-line no-console

    ({ temperature } = await this.jx90614.measure());
    console.log({ temperature }); // eslint-disable-line no-console

    ({ temperature } = await this.jx90614.measure());
    console.log({ temperature }); // eslint-disable-line no-console
  });
});
