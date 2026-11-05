// Mono frames, as the e-paper and mono drivers take them (Ssd1680, Ssd1681,
// St7302): width x height pixels row by row, a bit a pixel, 1 white, each
// row whole bytes, the leftmost pixel in a byte's MSB.

// a frame for width x height: a bit a pixel, all white
export function blankFrame(width, height) {
  return new Uint8Array(Math.ceil(width / 8) * height).fill(0xff);
}

// a pixel in a frame black (true) or white
export function plot(frame, width, x, y, black = true) {
  const i = y * Math.ceil(width / 8) + (x >> 3), bit = 0x80 >> (x & 7);
  frame[i] = black ? frame[i] & ~bit : frame[i] | bit;
}
