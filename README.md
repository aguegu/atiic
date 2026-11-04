# atiic

JavaScript drivers for I2C devices, on WCH's CH341 as the USB-to-I2C bridge
(in its I2C mode, `1a86:5512`): in Node, and in the browser over WebUSB, for
testing device drivers and for web apps that chart their readings, such as
[i2c.ninja](https://i2c.ninja).

1.0.0 starts over from an empty tree. The STC8H Atiic serial-to-I2C bridge
and its drivers end at [0.5.1](https://github.com/aguegu/atiic/tree/0.5.1).

The adapter: [docs/ch341.md](docs/ch341.md). Releases: [releases.md](releases.md).

## License

MIT ([LICENSE](LICENSE)), from 1.0.1. Up to 0.5.1 it was MPL-2.0.
