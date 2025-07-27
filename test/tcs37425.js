import { should } from 'chai';
import config from 'config';
import { Tcs37425 } from '../src/index.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

should();

describe('Tcs37425', () => {
  before(async function () {
    const adapter = new SerialportBindingCppAdapter(config.get('device'), null, 200);
    this.tcs37425 = new Tcs37425(adapter);
  });

  it('should init', async function () {
    return this.tcs37425.init();
  });

  // it('should measure', async function () {
  //   const { pressure, temperature } = await this.spl06.measure();
  //   temperature.should.be.a('number');
  //   pressure.should.be.a('number');
  //   console.log({ temperature, pressure }); // eslint-disable-line no-console
  // });
});
