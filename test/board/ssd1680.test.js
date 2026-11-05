// the SSD1680 on a bench: r8845's 1.54" 152x152 black/white e-paper module (BENCH_SSD1680)
import { Ssd1680 } from '../../src/index.js';
import { SSD1680 } from './bench.js';
import { epaperTests } from './epaper.js';

epaperTests(Ssd1680, SSD1680, 'BENCH_SSD1680', 'SSD1680');
