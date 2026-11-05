// A register-addressed SPI device as atiic's register bus: the two calls
// the I2C device drivers use, write(address, bytes) and writeRead(address,
// bytes, n), over any bus with spi(bytes) and pins({ name: level }) (the
// CH341's) and a chip-select line. The address (the device's I2C one) is
// ignored: the chip select picks the device. So a driver written for I2C runs
// over SPI unchanged, for chips whose SPI is their I2C register map with the
// first byte's bit 7 marking a read (InvenSense's MPU-6500, Bosch's BMX055):
//   write:     CS low, register, data..., CS high (a burst: the register
//              address advancing as on I2C)
//   writeRead: CS low, register | 0x80, n bytes clocked in, CS high
// On r8845, an MPU-6500 over the CH341A: WHO_AM_I 0x70, writes read back,
// atiic's Mpu6500 driver unchanged (test/board/mpu6500-spi.test.js).
const READ_BIT = 0x80;

class SpiRegisters {
  constructor(bus, { cs = 'D4', readBit = READ_BIT } = {}) {
    Object.assign(this, { bus, cs, readBit });
  }

  // the chip select high: deselected, before the first transfer
  async open() {
    await this.bus.pins({ [this.cs]: true });
    return this;
  }

  // the chip select around the bytes: by the bus's spiSelected() where it
  // has one (the CH341's: a USB round trip less), else pins() each side
  async transfer(bytes) {
    if (this.bus.spiSelected) return this.bus.spiSelected(this.cs, bytes);
    await this.bus.pins({ [this.cs]: false });
    try {
      return await this.bus.spi(bytes);
    } finally {
      await this.bus.pins({ [this.cs]: true });
    }
  }

  // bytes: the register, then the data to write from it on
  async write(address, bytes) {
    await this.transfer(bytes);
  }

  // bytes: the register (one byte); n bytes read from it on
  async writeRead(address, bytes, n) {
    if (bytes.length !== 1) throw new Error(`SPI writeRead: one register byte, not ${bytes.length}`);
    const back = await this.transfer([bytes[0] | this.readBit, ...new Array(n).fill(0)]);
    return back.slice(1);
  }
}

export default SpiRegisters;
