import chai from 'chai';
import config from 'config';
import Mt6701 from '../src/devices/mt6701.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

chai.should();

describe('mt6701', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'), null, 200);
    this.mt6701 = new Mt6701(adapter);
  });

  it('should read angle', async function () {
    const angle = await this.mt6701.readAngle();
    angle.should.be.a('number');
    console.log({ angle });
  });

});
