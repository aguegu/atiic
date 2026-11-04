# Releases

## 1.0.3

- MPU-6050, the first driver (`src/devices/mpu6050.js`, `import { Mpu6050 }
  from 'atiic'`): adapter-free, any bus with `write` and `writeRead`.
  `init(gyroscopeScale, accelerometerScale)` checks WHO_AM_I, writes its
  config in one burst and waits for a sample at the new settings (30 ms gyro
  start-up + 16 ms); `measure()`; `sleep()`; FIFO mode (`startFifo`,
  `readFifo`, `stopFifo`), every frame through up to gyro 4 kHz at 400 kHz.
- Tests: host 8 against a fake MPU-6050 (its registers, FIFO and every write);
  board 4 on r8845 at 400 kHz (1 g at rest, 1 kHz FIFO none lost). Host 14 of
  14, board 8 of 8 three runs in a row.

## 1.0.2

- The CH341 adapter (`src/adapters/ch341`, [docs/ch341.md](docs/ch341.md)),
  back from the tryout: `scan`, `write`, `read`, `writeRead` over WebUSB; in
  Node by the usb package, which now detaches the kernel's spi-ch341 itself
  (the tryout only ran because a probe had detached it before).
- Tooling: ESLint 10.14.0 as iap.meshmass.com; tests on Node's own runner
  (`node:test`, no test dependency: `npm test`, host, no hardware;
  `npm run test:board`, r8845's CH341T with an MPU-6050); minimatch 11.0.4
  override (npm audit: 0).
- Host 6 of 6, board 4 of 4 three runs in a row, from spi-ch341 bound.

## 1.0.1

- MIT license (0.5.1 and before: MPL-2.0).

## 1.0.0

- Started over from an empty tree: the CH341 in I2C mode replaces the STC8H
  Atiic bridge. 0.5.1 (tag `0.5.1`) is the last release on the old bridge.
