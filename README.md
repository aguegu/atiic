# atiic

JavaScript drivers for I2C and SPI sensors and displays, run from a PC
through WCH's CH341 USB adapter (`1a86:5512`, in its I2C/SPI mode) or its
high-speed successor the CH347 (I2C, SPI and its GPIOs: a CH347T in mode
1, or a CH347F): in Node.js, and in the browser over WebUSB. Write and test a device driver on
your desktop in a modern language, with unit tests, instead of reflashing a
microcontroller; or chart the readings in a web app, such as
[i2c.ninja](https://i2c.ninja).

- **Adapter-free drivers:** a driver takes any bus with `write`, `read`,
  `writeRead` (I2C), or `spi` and `pins` (SPI); the CH341 and the CH347
  are such buses.
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

### Memory

| Device | Driver | Size | Bus, address |
|---|---|---|---|
| Atmel AT24C08 (the AT24C01A-16A family) | `At24c` | 1 KB EEPROM (the family: 128 B to 2 KB); reads, page writes | I2C 0x50-0x53 |

### I2C addresses

What each driver looks for, what picks the address, and where the bench
has had it. Addresses in **bold** are the ones board-tested.

| Device | Addresses | Picked by | On the bench |
|---|---|---|---|
| MPU-6050 | **0x68**, 0x69 | AD0 pin | 0x68 (GY-521) |
| MPU-6500 | **0x68**, 0x69 | AD0 pin | 0x68 (GY-9250); also SPI |
| BMX055 accelerometer | 0x18, **0x19** | SDO1 pin | 0x19 (CJMCU-900F); also SPI |
| BMX055 gyroscope | 0x68, **0x69** | SDO2 pin | 0x69 |
| BMX055 magnetometer | 0x10-0x12, **0x13** | SDO1 and CSB3 pins (Table 64) | 0x13 |
| ITG-3200 | **0x68**, 0x69 | AD0 pin | 0x68 |
| ADXL345 | **0x53**, 0x1D | SDO/ALT ADDRESS pin (low: 0x53) | 0x53 |
| HMC5883L | **0x1E** | fixed | 0x1E |
| MAX30102 | **0x57** | fixed | 0x57 |
| SHT20 | **0x40** | fixed | 0x40 |
| AHT21B | **0x38** | fixed | 0x38 |
| VL53L1X | **0x29** | 0x29 at power-up; software can move it (ST's driver; not in atiic) | 0x29 |
| MLX90614 | **0x5A** | its EEPROM (SMBus address, 0x0E); not changed by atiic | 0x5A |
| INA231 | **0x40**-0x4F | A0, A1 pins | 0x40 |
| AT24C08 | **0x50-0x53** (one per 256-byte block) | A2 pin (high: 0x54-0x57) | 0x50-0x53 |

Shared addresses to keep apart on one bus: 0x68/0x69 (the MPUs, the
ITG-3200, the BMX055's gyro), 0x40 (the SHT20, an INA231 with A0 and A1
low), 0x53 (the ADXL345 and an AT24C08's last block: on r8845 both
answered, reads looked right, and the ADXL's writes landed in the EEPROM).

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
- The CH347 adapter (its modes, I2C as measured): [docs/ch347.md](docs/ch347.md)
- The dart adapter (the user's own bridge, WebUSB, clock stretching waited for): [docs/dart.md](docs/dart.md)
- The two side by side on I2C: [docs/i2c_adapters.md](docs/i2c_adapters.md)
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
