Atiic
===

The Javascript libraries to interact with Atiic devices. Atiic is a Serial-i2c bridge module.

This package is the core dependence of [i2c.ninja](https://i2c.ninja)

## Hardware v2

Main Chip: STC8H3K48S2

1A: AGS10, works
23: BH1750, works
29: VL53L0X, works
38: AHT21, works
68: MPU6050, works
5A: MLX90614, works
76: SPL06, works

## Releases

### 0.5.0
  * dependencies upgraded
  * eslint upgraded

### 0.4.16
  * new device: TCS37425, color sensor
  * new device: SSD1306, oled display

### 0.4.15
  * new device: AGS10, TVOC sensor

### 0.4.11 - 0.4.14
  * new device: VL53L0X

### 0.4.10
  * new Device: SHT20 Humidity and Temperature Sensor

### 0.4.9
  * tweak INA231 measurement rounding

### 0.4.8
  * new Device: INA231 Current, Voltage and Power Monitor

### 0.4.7
  * remove Buffer reference in Mlx90614

### 0.4.6
  * new Device: MLX90614 Infrared Thermometer

### 0.4.5
  * bugfix: remove assert in device code for browsers

### 0.4.4
  * bugfix: export V53L

### 0.4.3
  * new Device: V53Lx ToF Distance Sensor

### 0.4.2
  * fix Jx90614 for browser

### 0.4.1
  * addresses for Spl06 and Mpu6050
  * new Device: Infrared Thermometer JX90614(NSA3300)

### 0.4.0
  * compatible with non-echo Atiic devices
  * dependencies upgraded
