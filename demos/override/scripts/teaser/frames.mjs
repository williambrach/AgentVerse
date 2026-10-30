// Renders the stage frame by frame: node frames.mjs <16x9|9x16> <out-dir | -> [--at 0.7,2.2,...]
// With '-' the PNG frames stream to stdout (for ffmpeg -f image2pipe) instead of files.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [aspect = '16x9', outDir = 'out/frames', ...rest] = process.argv.slice(2);
const at = rest[0] === '--at' ? rest[1].split(',').map(Number) : null;
const FPS = 30, SECONDS = 10;
const size = aspect === '9x16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

const toStdout = outDir === '-';
if (!toStdout) await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
const stage = pathToFileURL(new URL('stage.html', import.meta.url).pathname);
await page.goto(`${stage}?aspect=${aspect}`);
await page.evaluate(() => window.stageReady);

const times = at ?? Array.from({ length: FPS * SECONDS }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await page.evaluate(t => window.renderAt(t), t);
  if (toStdout) {
    const png = await page.screenshot();
    if (!process.stdout.write(png)) await new Promise(done => process.stdout.once('drain', done));
    continue;
  }
  const name = at ? `t${t.toFixed(2)}.png` : `f${String(i).padStart(4, '0')}.png`;
  await page.screenshot({ path: `${outDir}/${name}` });
}
console.error(`${aspect}: ${times.length} frames -> ${toStdout ? 'stdout' : outDir}`);
await browser.close();
