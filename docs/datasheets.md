# Datasheets

The drivers are written from their chips' datasheets, and the source cites
them by file name (`docs/<file>`). The documents are their makers', so they
aren't kept in this repository (`.gitignore`: `docs/*.pdf`, `docs/*.PDF`,
`docs/*.H`). Get each from its maker and save it under the name below; the
revision tells you it's the one the driver follows, and the first 12 hex
digits of its SHA-256 that it's the very file (`sha256sum docs/<file>`).
Links go to a maker's product page where one is known, else its site.

## Sensors

| File | Document | Maker | Revision | SHA-256 |
|---|---|---|---|---|
| `adxl345.pdf` | ADXL345 datasheet | [Analog Devices](https://www.analog.com) | Rev. G | `87ae2212498c` |
| `AGR12-AGN12-AGP12-2026-05.pdf` | AGR12 / AGN12 / AGP12 pressure sensors | [ASAIR (Aosong)](https://www.aosong.com) | 2026-05 | `4cad8100b5bd` |
| `AGS10-Datasheet.pdf` | AGS10 TVOC sensor | [ASAIR (Aosong)](https://www.aosong.com) | | `7aab0cab5fbb` |
| `AGS2602-2026-05.pdf` | AGS2602 TVOC sensor | [ASAIR (Aosong)](https://www.aosong.com) | 2026-05 | `b822c1216404` |
| `AHT20-datasheet.pdf` | AHT20 humidity and temperature | [ASAIR (Aosong)](https://www.aosong.com) | | `1e460b777986` |
| `AHT21B产品规格书英文版-A2.pdf` | AHT21B humidity and temperature (English) | [ASAIR (Aosong)](https://www.aosong.com) | A2 | `e989de3b84e9` |
| `AHT30-datasheet.pdf` | AHT30 humidity and temperature | [ASAIR (Aosong)](https://www.aosong.com) | | `cc8e9d716bef` |
| `AP3216C-Rev0.80.pdf` | AP3216C light and proximity | [Lite-On](https://optoelectronics.liteon.com) | 0.80 | `c5f3fb6fab48` |
| `AP3216C-Rev0.86.pdf` | AP3216C light and proximity | [Lite-On](https://optoelectronics.liteon.com) | 0.86 | `5d492369365e` |
| `AS7341-DS000504.pdf` | AS7341 spectral sensor | [ams OSRAM](https://ams-osram.com) | DS000504 | `009dda25dce2` |
| `BST-BMX055-DS000.pdf` | BMX055 9-axis IMU | [Bosch Sensortec](https://www.bosch-sensortec.com) | DS000 | `347ecf413def` |
| `CHT8305C-rev2.5.pdf` | CHT8305C humidity and temperature | Sensylink | 2.5 (2021-10-26) | `cce7b06dda85` |
| `ENS160-v1.3.pdf` | ENS160 air quality | [ScioSense](https://www.sciosense.com) | 1.3 | `dbe06607f42b` |
| `HDC1080-ZHCSET2A.pdf` | HDC1080 humidity and temperature (Chinese edition) | [TI](https://www.ti.com/product/HDC1080) | ZHCSET2A (Rev. A) | `f5d96eef2aa3` |
| `HMC5883L.pdf` | HMC5883L magnetometer | [Honeywell](https://www.honeywell.com) | | `b89c0722a766` |
| `HTU21D-HPC199_3.pdf` | HTU21D(F) humidity and temperature | [TE Connectivity](https://www.te.com) | HPC199_3 | `80ad11afaef5` |
| `ina226.pdf` | INA226 current and power monitor | [TI](https://www.ti.com/product/INA226) | Rev. C | `c9b67f886d4a` |
| `ina231.pdf` | INA231 current and power monitor | [TI](https://www.ti.com/product/INA231) | Rev. D | `c20f1dcfe2a5` |
| `ITG-3200.pdf` | ITG-3200 gyroscope (product specification) | [TDK InvenSense](https://invensense.tdk.com) | | `ee4599343fab` |
| `itg-3200-datasheet.pdf` | ITG-3200 gyroscope (register map) | [TDK InvenSense](https://invensense.tdk.com) | | `3f40d0d80a1f` |
| `LM75-ADI-rev3.pdf` | LM75 temperature sensor | [Analog Devices (Maxim)](https://www.analog.com) | Rev. 3 | `cf9f03f21e66` |
| `LM75A-NXP-rev04.pdf` | LM75A temperature sensor | [NXP](https://www.nxp.com) | Rev. 04 | `fc76b747cd9e` |
| `MAX30100-19-7065.pdf` | MAX30100 pulse oximeter | [Analog Devices (Maxim)](https://www.analog.com) | 19-7065 | `6ed78f87f531` |
| `MAX30102.pdf` | MAX30102 pulse oximeter | [Analog Devices (Maxim)](https://www.analog.com) | | `252e039335ae` |
| `MLX90614-Datasheet-Melexis.pdf` | MLX90614 infrared thermometer | [Melexis](https://www.melexis.com) | | `5baade0b66aa` |
| `OPT3001-SBOS681C.pdf` | OPT3001 ambient light | [TI](https://www.ti.com/product/OPT3001) | SBOS681C | `f2ab3d4822cb` |
| `QMC5883L-RevB.pdf` | QMC5883L magnetometer | [QST](https://www.qstcorp.com) | Rev. B | `b68aa5e3920f` |
| `QMC5883P-RevE.pdf` | QMC5883P magnetometer | [QST](https://www.qstcorp.com) | Rev. E | `fb2dc9770292` |
| `Sensirion_Datasheet_Humidity_Sensor_SHT20.pdf` | SHT20 humidity and temperature | [Sensirion](https://sensirion.com) | | `6b9e83d3a883` |
| `SGP30-v1.0.pdf` | SGP30 air quality | [Sensirion](https://sensirion.com/products/catalog/SGP30) | 1.0 | `edf8a16d205e` |
| `SGP40-v1.2.pdf` | SGP40 VOC sensor | [Sensirion](https://sensirion.com/products/catalog/SGP40) | 1.2 | `884db88ab45a` |
| `SHT4x-v2-2021-07.pdf` | SHT4x humidity and temperature | [Sensirion](https://sensirion.com) | 2 (2021-07) | `6b8b2edfa758` |
| `TCS3472-DS000390.pdf` | TCS3472 colour sensor | [ams OSRAM](https://ams-osram.com) | DS000390 | `51d05603e06a` |
| `VL6180X-DocID026171-Rev7.pdf` | VL6180X proximity and ALS | [ST](https://www.st.com/en/imaging-and-photonics-solutions/vl6180x.html) | DocID026171 Rev 7 | `87e1b0966816` |
| `VL6180X-AN4545-Rev1.pdf` | AN4545, VL6180X basic ranging | [ST](https://www.st.com/en/imaging-and-photonics-solutions/vl6180x.html) | DocID026571 Rev 1 | `091291adc981` |

## Memory and displays

| File | Document | Maker | Revision | SHA-256 |
|---|---|---|---|---|
| `AT24C01A-16A.pdf` | AT24C01A/02/04/08/16 EEPROMs | [Microchip (Atmel)](https://www.microchip.com) | | `a084aa10aada` |
| `GC9107_DataSheet_V1.2.pdf` | GC9107 TFT controller | GalaxyCore | 1.2 | `b92cb5fdfdbd` |
| `GC9A01A.pdf` | GC9A01A round TFT controller | GalaxyCore | | `af8f6f0a03f4` |
| `SSD1680_Rev1.4.pdf` | SSD1680 e-paper controller | Solomon Systech | 1.4 | `0c5edac55e84` |
| `SSD1681_Rev1.1.pdf` | SSD1681 e-paper controller | Solomon Systech | 1.1 | `da23b888cdc9` |
| `ST7302_V0.0.pdf` | ST7302 reflective LCD controller | [Sitronix](https://www.sitronix.com.tw) | 0.0 | `4c4051576aab` |
| `ST7735S_V1.3_20120620.pdf` | ST7735S TFT controller | [Sitronix](https://www.sitronix.com.tw) | 1.3 (2012-06-20) | `fe2381791a4e` |

## The bridges (WCH)

All from [WCH](https://www.wch-ic.com).

| File | Document | Revision | SHA-256 |
|---|---|---|---|
| `CH341DS1.PDF` | CH341 datasheet, part 1 | | `8f76a55cf6fb` |
| `CH341DS2.PDF` | CH341 datasheet, part 2 | | `738ff2ef0a42` |
| `CH341EVT.PDF` | CH341 evaluation board | | `8ba34c429e26` |
| `CH341DLL.H` | CH341 Windows DLL header | | `1774684fcb61` |
| `CH347DS1.PDF` | CH347 datasheet | 1.6 | `1c7ad2ce273d` |
| `CH347EVT_EN.pdf` | CH347 evaluation board (English) | | `6914f363ec65` |
| `CH347SCH.pdf` | CH347 evaluation board schematic | | `8206eda698b7` |
| `CH347ApplicationDevelopmentManual.pdf` | CH347 application development manual | | `9888d96fb523` |
| `CH347DLL_EN.H` | CH347 Windows DLL header (English) | | `ec9d0b9f9b32` |
