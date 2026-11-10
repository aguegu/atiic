// dart in Node: the usb package's WebUSB gives the same USBDevice a browser
// does, so the same Dart runs on it. On Linux the user needs write access
// to the device node (a udev rule, docs/dart.md); no kernel driver binds a
// vendor interface, so there is nothing to detach.
import { WebUSB } from 'usb';
import Dart, { FILTERS } from './index.js';

// speed: I2C's SCL, Hz (100000 or 400000; a 1.1 dart any from 7327 to
// 400000)
export async function openDart(speed = 100000) {
  const webusb = new WebUSB({ allowAllDevices: true });
  const device = await webusb.requestDevice({ filters: FILTERS });
  return new Dart(device).open(speed);
}

export default openDart;
