# atiic

JavaScript drivers for I2C and SPI sensors and displays, run from a PC
through WCH's CH341 USB adapter (`1a86:5512`, in its I2C/SPI mode): in
Node.js, and in the browser over WebUSB. Write and test a device driver on
your desktop in a modern language, with unit tests, instead of reflashing a
microcontroller; or chart the readings in a web app, such as
[i2c.ninja](https://i2c.ninja).

- **Adapter-free drivers:** a driver takes any bus with `write`, `read`,
  `writeRead` (I2C), or `spi` and `pins` (SPI); the CH341 is one such bus.
- **I2C and SPI on one dongle:** the CH341's I2C at 20-750 kHz, its SPI
  (mode 0, ~110 KB/s), its D0-D5 lines as chip selects, resets, BUSY inputs.
- **The same driver on either bus:** `SpiRegisters` turns SPI and a chip
  select into the I2C drivers' register bus (the MPU-6500 and the BMX055
  run unchanged on both).
- **Tested on real hardware:** every device below has board tests, run on a
  bench of CH341T and CH341A dongles, besides host tests against fakes.

```js
import { Mpu6050 } from 'atiic';
import { openCh341 } from 'atiic/adapters/ch341/node';

const bus = await openCh341(400000); // I2C at 400 kHz
const imu = new Mpu6050(bus);
await imu.init();
console.log(await imu.measure()); // { accelerometers, gyroscopes, temperature }
```

## Devices

Each one board-tested (`npm run test:board`) on the bench; its datasheet's
sections and quirks are in the driver's source.

### Sensors

| Device | Driver | Measures | Bus, address |
|---|---|---|---|
| InvenSense MPU-6050 | `Mpu6050` | 3-axis accelerometer, gyroscope, temperature; FIFO | I2C 0x68/0x69 |
| InvenSense MPU-6500 (GY-9250) | `Mpu6500` | 3-axis accelerometer, gyroscope; FIFO (8 kHz gyro over SPI) | I2C 0x68/0x69, SPI |
| Bosch BMX055 (CJMCU-900F) | `Bmx055Accel`, `Bmx055Gyro`, `Bmx055Mag` | 9 axes: accelerometer, gyroscope, magnetometer (compass) | I2C, SPI |
| Maxim / ADI MAX30102 | `Max30102` | pulse oximetry and heart rate (red and IR PPG), die temperature | I2C 0x57 |
| Sensirion SHT20 | `Sht20` | relative humidity, temperature | I2C 0x40 |
| Aosong AHT21B | `Aht21` | relative humidity, temperature | I2C 0x38 |
| ST VL53L1X | `Vl53l1x` | time-of-flight distance (to ~4 m) | I2C 0x29 |
| Melexis MLX90614 | `Mlx90614` | non-contact infrared temperature, ambient temperature | I2C 0x5A (SMBus, 100 kHz) |
| TI INA231 (INA226) | `Ina231` | current, bus voltage, power (shunt monitor) | I2C 0x40-0x4F |
| Analog Devices ADXL345 | `Adxl345` | 3-axis accelerometer (+/-16 g, full resolution), self test | I2C 0x53/0x1D |
| Honeywell HMC5883L | `Hmc5883l` | 3-axis magnetometer (compass), self test | I2C 0x1E |
| InvenSense ITG-3200 | `Itg3200` | 3-axis gyroscope (+/-2000 deg/s), temperature | I2C 0x68/0x69 |
| Atmel AT24C08 (AT24C01A-16A) | `At24c` | EEPROM, 1 KB (128 B to 2 KB): reads, page writes | I2C 0x50-0x53 |

### Displays

| Device | Driver | Panel | Bus |
|---|---|---|---|
| Sitronix ST7735S | `St7735s` | 0.96" 80x160 IPS TFT, 12/16/18-bit colour, hardware scrolling | SPI |
| GalaxyCore GC9107 | `Gc9107` | 1.45" 60x160 IPS TFT | SPI |
| GalaxyCore GC9A01 | `Gc9a01` | 1.28" round 240x240 IPS TFT | SPI |
| Solomon Systech SSD1680 | `Ssd1680` | 1.54" 152x152 e-paper (e-ink): full and partial refresh, deep sleep | SPI, BUSY |
| Solomon Systech SSD1681 | `Ssd1681` | 1.54" 200x200 e-paper (e-ink) | SPI, BUSY |
| Sitronix ST7302 | `St7302` | 2.13" 122x250 reflective mono TFT (low power) | SPI |

Tried and not supported: Aosong's AGS10 (TVOC) wants I2C at 15 kHz or
under, below the CH341's slowest (20 kHz).

## Docs

- The bench, wiring, each device: [docs/setup.md](docs/setup.md)
- The CH341 adapter (I2C, SPI, D0-D7, speeds): [docs/ch341.md](docs/ch341.md)
- Releases: [releases.md](releases.md)

1.0.0 started over from an empty tree. The STC8H Atiic serial-to-I2C bridge
and its drivers end at [0.5.1](https://github.com/aguegu/atiic/tree/0.5.1).

## License

MIT ([LICENSE](LICENSE)), from 1.0.1. Up to 0.5.1 it was MPL-2.0.

Third party, their notices kept in the files:

- `src/devices/bmx055-mag.js` follows Bosch Sensortec's [BMM150 Sensor
  API](https://github.com/boschsensortec/BMM150_SensorAPI) for the
  magnetometer's compensation (BSD-3-Clause).
- `src/devices/vl53l1x.js` carries ST's Ultra Lite Driver default
  configuration and sequence (BSD-3-Clause).
