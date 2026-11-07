// The CH347 in Node: the usb package's WebUSB gives the same USBDevice a
// browser does, so the same Ch347 runs on it. On Linux the user needs write
// access to the device node (a udev rule, docs/ch347.md); the kernel binds
// cdc_acm to the serial port only, but any driver on the vendor interface
// is detached first (the usb package's detachKernelDriver).
import { WebUSB } from 'usb';
import Ch347, { FILTERS, findInterface } from './index.js';

// speed: I2C's SCL; options: { spiHz, spiMode } (Ch347.open)
export async function openCh347(speed = 100000, options = {}) {
  const webusb = new WebUSB({ allowAllDevices: true });
  const device = await webusb.requestDevice({ filters: FILTERS });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  if (process.platform === 'linux') {
    try {
      await device.detachKernelDriver(findInterface(device.configuration).number);
    } catch {
      // none bound: nothing to detach
    }
  }
  return new Ch347(device).open(speed, options);
}

export default openCh347;
