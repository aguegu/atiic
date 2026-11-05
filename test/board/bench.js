// What's on the bench: each known chip looked for at its addresses by its
// own ID register, once before the tests are laid out, so each chip's tests
// run only with that chip there (and skip with the reason otherwise).
import { openCh341 } from '../../src/adapters/ch341/node.js';
import { Mpu6050, Mpu6500, Bmx055Accel } from '../../src/index.js';

// for test/board/ch341.test.js, each chip's registers as the CH341's
// reference: how to wake it, a range with no sensor data (a block read must
// match byte reads), a register to write and read back, and values for it
export const REFERENCES = [
  { Driver: Mpu6050, wake: [0x6b, 0x00], staticFirst: 0x0d, staticLast: 0x39, writable: 0x19, values: [0x5a, 0xa5] },
  { Driver: Mpu6500, wake: [0x6b, 0x00], staticFirst: 0x0d, staticLast: 0x39, writable: 0x19, values: [0x5a, 0xa5] },
  // BMX055's accelerometer: its configuration, 0x0f-0x3d (FIFO_STATUS 0x0e and FIFO_DATA 0x3f outside);
  // PMU_BW takes 0x08-0x0f
  { Driver: Bmx055Accel, wake: [0x11, 0x00], staticFirst: 0x0f, staticLast: 0x3d, writable: 0x10, values: [0x09, 0x0e] },
];

async function probe() {
  const found = new Map(); // Driver -> address
  const bus = await openCh341();
  try {
    for (const { Driver } of REFERENCES) {
      for (const a of Driver.addresses) {
        if (!(await bus.acks(a))) continue;
        const [id] = await bus.writeRead(a, [Driver.chip.idRegister], 1);
        if (id === Driver.chip.whoAmI) { found.set(Driver, a); break; }
      }
    }
  } finally {
    await bus.close();
  }
  return found;
}

const found = await probe();

export const addressOf = (Driver) => found.get(Driver) ?? null;

// a describe() option: skip with the reason unless the chip is on the bench
export const onlyWith = (Driver) => ({
  skip: found.has(Driver) ? false : `no ${Driver.chip.name} on the bench (none at ${Driver.addresses.map((a) => `0x${a.toString(16)}`).join(' or ')} with ID 0x${Driver.chip.whoAmI.toString(16)})`,
});

// the first chip found, with its address: the CH341 test's reference
export const reference = REFERENCES.map((r) => ({ ...r, address: found.get(r.Driver) })).find((r) => r.address !== undefined) ?? null;
