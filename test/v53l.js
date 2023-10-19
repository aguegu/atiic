import config from 'config';
import V53l from '../src/devices/v53l.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

describe('v53l', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new V53l(adapter);
  });

  it('should init', async function () {
    return this.device.init();
  });

  it.skip('should get ready', async function () {
    await this.device.getReady();
  });

  it('should get measurement', async function() {
    const { distance } = await this.device.measureRegular();
    console.log({ distance });
  });

  it('should get oneshort measurement', async function() {
    let distance;
    ({ distance } = await this.device.measure());
    console.log({ distance });
    ({ distance } = await this.device.measure());
    console.log({ distance });
    ({ distance } = await this.device.measure());
    console.log({ distance });
    ({ distance } = await this.device.measure());
    console.log({ distance });
    ({ distance } = await this.device.measure());
    console.log({ distance });
  });
});
