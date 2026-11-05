// the SSD1681 on a bench: r8845's 1.54" 200x200 black/white e-paper module (BENCH_SSD1681)
import { Ssd1681 } from '../../src/index.js';
import { SSD1681 } from './bench.js';
import { epaperTests } from './epaper.js';

epaperTests(Ssd1681, SSD1681, 'BENCH_SSD1681', 'SSD1681');
