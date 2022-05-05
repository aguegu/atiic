import Spl06 from '../src/devices/spl06.js';
import SerialportBindingCppAdapter from '../src/adapters/serialport_bindingscpp.js';

describe('spl06', () => {
  before(async function() {
    const adapter = new SerialportBindingCppAdapter('/dev/ttyUSB0', null, 200);
    this.spl06 = new Spl06(adapter, '77');
  });

  it('should init', async function () {
    this.timeout(10000);
    return this.spl06.init();
  });

  it('should seed', async function () {
    console.log(await this.spl06.seed());
  });
});
