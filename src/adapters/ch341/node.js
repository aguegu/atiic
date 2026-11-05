// The CH341 in Node: the usb package's WebUSB gives the same USBDevice a
// browser does, so the same Ch341 runs on it. On Linux the user needs write
// access to the device node (a udev rule, docs/ch341.md), and the kernel's
// spi-ch341 binds to the chip: WebUSB can't claim it then, so it's detached
// first (the usb package's detachKernelDriver), until the next replug.
import { WebUSB } from 'usb';
import Ch341, { FILTERS } from './index.js';
import { INTERFACE } from './protocol.js';

export async function openCh341(speed = 100000) {
  const webusb = new WebUSB({ allowAllDevices: true });
  const device = await webusb.requestDevice({ filters: FILTERS });
  await device.open();
  if (process.platform === 'linux') {
    try {
      await device.detachKernelDriver(INTERFACE);
    } catch {
      // none bound: nothing to detach
    }
  }
  // a USB reset: an earlier run cut short can leave the CH341 holding
  // replies nobody read, and then it takes no command at all (r8845: every
  // open "Cancelled" until reset)
  await device.reset();
  return new Ch341(device).open(speed);
}

export default openCh341;
