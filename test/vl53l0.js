import config from 'config';
import { Vl53l0 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

describe('v53l0', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'));
    this.device = new Vl53l0(adapter);
  });

  it('should init', async function () {
    this.timeout(5000);
    return this.device.init();
  });

  it('should single measure', async function () {
    let mm = await this.device.readRangeSingleMillimeters();
    console.log({ mm });
    mm = await this.device.readRangeSingleMillimeters();
    console.log({ mm });
    mm = await this.device.readRangeSingleMillimeters();
    console.log({ mm });
    mm = await this.device.readRangeSingleMillimeters();
    console.log({ mm });
  });

  it('should get continuous measurements', async function () {
    await this.device.startContinuous();

    let mm = await this.device.readRangeContinuousMillimeters();
    console.log({ mm });
    mm = await this.device.readRangeContinuousMillimeters();
    console.log({ mm });
    mm = await this.device.readRangeContinuousMillimeters();
    console.log({ mm });
    mm = await this.device.readRangeContinuousMillimeters();
    console.log({ mm });

    await this.device.stopContinuous();
  });
});
