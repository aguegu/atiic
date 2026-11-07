// ST7302 2.13" 250x122 reflective mono TFT: zhcong/ST7302-for-arduino's
// (MIT) init, then a card packed as its flush_buffer does: the frame 250
// wide (x) by 122 tall (y, padded to 132 = 11 bands of 12), each band sent
// as 125 pixel pairs x 3 bytes (rows 0-3, 4-7, 8-11; a row 2 bits, x even
// the higher). A 1 bit dark (to be seen). Card: a 2-pixel border, a 20x20
// square at the top-left (x 4, y 4), a checkerboard in the middle, a 4x4
// dot at the bottom-right
import { openCh341 } from '/home/agu/gitpool/atiic/src/adapters/ch341/node.js';

const W = 250, H = 122, BANDS = Math.ceil(H / 12), PAIRS = Math.ceil(W / 2);
const CS = 'D2', DC = 'D1', RES = 'D0';
const bus = await openCh341();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function command(c, data = []) {
  await bus.pins({ [CS]: false, [DC]: false });
  await bus.spi([c]);
  if (data.length) { await bus.pins({ [DC]: true }); await bus.spi(data); }
  await bus.pins({ [CS]: true });
}

await bus.pins({ [CS]: true, [DC]: true, [RES]: true });
await bus.pins({ [RES]: false });
await sleep(100);
await bus.pins({ [RES]: true });
await sleep(100);
for (const [c, ...d] of [
  [0x38], // HPM
  [0xeb, 0x02], // enable OTP
  [0xd7, 0x68], // OTP load control
  [0xd1, 0x01], // auto power control
  [0xc0, 0x80], // gate voltage VGH 12 V, VGL -5 V
  [0xc1, 0x28, 0x28, 0x28, 0x28, 0x14, 0x00], // VSH
  [0xc2, 0x00, 0x00, 0x00, 0x00], // VSL
  [0xcb, 0x14], // VCOMH
  [0xb4, 0xe5, 0x77, 0xf1, 0xff, 0xff, 0x4f, 0xf1, 0xff, 0xff, 0x4f], // gate EQ
  [0x11], // sleep out
]) await command(c, d);
await sleep(100);
for (const [c, ...d] of [
  [0xc7, 0xa6, 0xe9], // OSC
  [0xb0, 0x64], // duty: 250 / 4 = 0x3f... as zhcong: 0x64
  [0x36, 0x20], // MADCTL
  [0x3a, 0x11], // data format: 3 writes for 24 bits
  [0xb9, 0x23], // source setting
  [0xb8, 0x09], // panel setting: frame inversion
  [0x2a, 0x05, 0x36], // column address S61-S182
  [0x2b, 0x00, 0xc7], // row address G1-G250
  [0xd0, 0x1f],
  [0x29], // display on
  [0xb9, 0xe3], // clear RAM on
]) await command(c, d);
await sleep(100);
await command(0xb9, [0x23]); // clear RAM off
await command(0x72, [0x00]); // destress off
await command(0x39); // LPM

const px = new Uint8Array(BANDS * 12 * PAIRS * 2); // [y][x], 1 dark
const set = (x, y) => { px[y * PAIRS * 2 + x] = 1; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
  const square = x >= 4 && x < 24 && y >= 4 && y < 24;
  const dot = x >= W - 10 && x < W - 6 && y >= H - 10 && y < H - 6;
  const checker = x >= 105 && x < 145 && y >= 41 && y < 81 && (((x >> 2) + (y >> 2)) & 1);
  if (border || square || dot || checker) set(x, y);
}
const at = (x, y) => px[y * PAIRS * 2 + x];
const out = [];
for (let b = 0; b < BANDS; b++) for (let p = 0; p < PAIRS; p++) for (let q = 0; q < 3; q++) {
  let byte = 0;
  for (let r = 0; r < 4; r++) {
    const y = b * 12 + q * 4 + r, x = p * 2;
    byte |= (at(x, y) << (7 - 2 * r)) | (at(x + 1, y) << (6 - 2 * r));
  }
  out.push(byte);
}
await command(0x2a, [0x19, 0x19 + BANDS - 1]);
await command(0x2b, [0x00, PAIRS - 1]);
const t0 = performance.now();
await command(0x2c, out);
console.log(`${out.length} bytes in ${(performance.now() - t0).toFixed(0)} ms`);
await bus.close();
