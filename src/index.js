import Spl06 from './spl06.js';
import Aht21 from './aht21.js';

import SerialportBindingCppAdapter from './adapters/serialport-bindingscpp.js';

const adapter = new SerialportBindingCppAdapter('/dev/ttyUSB0')

const spl06 = new Spl06(adapter);
const aht21 = new Aht21(adapter);

await spl06.init();
await aht21.init();

console.log(await spl06.seed());
console.log(await aht21.seed());
