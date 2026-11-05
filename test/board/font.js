// a 5x7 font for the board tests' labels: digits, drawn to read left to
// right with the module held landscape (its portrait top on the left, its
// column 0 at the bottom: r8845's ST7735S and GC9107 modules both)
const GLYPHS = { // rows top to bottom, bit 4 the left column
  0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  2: [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  3: [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  5: [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  6: [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
};

// a label's pixels for draw(x, y, cols, rows, ...): `rows` panel rows (left
// to right held landscape) by `cols` columns (the top of it held landscape),
// white text at `scale`, centred, on black
export function label(text, cols, rows, scale = 2) {
  const px = new Array(rows * cols).fill(0x000000);
  const width = (text.length * 6 - 1) * scale, left = Math.floor((rows - width) / 2);
  [...text].forEach((ch, i) => GLYPHS[ch].forEach((bits, gy) => {
    for (let gx = 0; gx < 5; gx++) if ((bits >> (4 - gx)) & 1) {
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const lx = left + (i * 6 + gx) * scale + sx, ly = 1 + gy * scale + sy;
        if (lx >= 0 && lx < rows && ly < cols) px[lx * cols + (cols - 1 - ly)] = 0xffffff;
      }
    }
  }));
  return px;
}
