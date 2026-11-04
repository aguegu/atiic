// what's on the bench: the IMU at 0x68 by its WHO_AM_I, read once before
// the tests are laid out, so each chip's tests run only with that chip there
import { openCh341 } from '../../src/adapters/ch341/node.js';

const IMU = 0x68;
const REG_WHO_AM_I = 0x75;

async function probe() {
  const bus = await openCh341();
  try {
    if (!(await bus.acks(IMU))) return null;
    return (await bus.writeRead(IMU, [REG_WHO_AM_I], 1))[0];
  } finally {
    await bus.close();
  }
}

export const imuWhoAmI = await probe();

// a describe() option: skip with the reason unless the chip at 0x68 is it
export const onlyWith = (Driver) => ({
  skip: imuWhoAmI === Driver.chip.whoAmI ? false
    : `no ${Driver.chip.name} on the bench (0x68: ${imuWhoAmI === null ? 'nothing' : `WHO_AM_I 0x${imuWhoAmI.toString(16)}`})`,
});
