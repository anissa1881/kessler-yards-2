// Capture the game's three screenshots, then check them against the competition's rules.
//
//   node capture.mjs            # uses a Chrome already installed on this machine
//   node capture.mjs --install  # first run: let Playwright fetch its own Chromium
//
// It serves game/ on a free port, opens ?shot=start, ?shot=play and ?shot=end, waits for the
// game to report the frame is painted (window.__shotReady), and writes screenshots/0-play.jpg,
// 1-start.jpg and 2-end.jpg. Then it checks every rule the gate applies to a screenshot: a whole
// JPEG, at most 256 KiB, long side at most 1280, short side at least 480.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(join(here, 'game'));
const OUT = resolve(join(here, 'screenshots'));

const WIDTH = 1280;
const HEIGHT = 720;

const FRAMES = [
  { name: '0-play.jpg', shot: 'play' },
  { name: '1-start.jpg', shot: 'start' },
  { name: '2-end.jpg', shot: 'end' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Serve game/ only, refusing any path that escapes it. */
function serve() {
  const server = createServer((req, res) => {
    let path = new URL(req.url ?? '/', 'http://entry').pathname;
    if (path === '/') path = '/index.html';
    const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => ready(server));
  });
}

/** Load playwright, or install it on the first run when --install is given. */
async function loadPlaywright(wantInstall) {
  try {
    return await import('playwright');
  } catch {
    if (!wantInstall) {
      console.error('playwright is not installed. Run:  npm i playwright  (then: node capture.mjs --install)');
      process.exit(1);
    }
  }
  // On Windows npm and npx are .cmd shims, which spawn only finds through a shell.
  const run = (command, args) =>
    new Promise((done, fail) => {
      const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
    });
  console.log('installing playwright...');
  await run('npm', ['i', '--no-audit', '--no-fund', 'playwright']);
  console.log('fetching a chromium build...');
  await run('npx', ['playwright', 'install', 'chromium']);
  return import('playwright');
}

/** Read a JPEG's frame size from its start-of-frame marker. */
function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    const length = buffer.readUInt16BE(i + 2);
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry the frame size
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

const { chromium } = await loadPlaywright(process.argv.includes('--install'));
mkdirSync(OUT, { recursive: true });

const server = await serve();
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch(
  process.argv.includes('--software')
    // Software rasterisation, for a machine with no working GPU driver.
    ? {
        args: [
          '--enable-unsafe-swiftshader',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--disable-gpu-sandbox',
        ],
      }
    // A real window, for a machine whose GPU works but whose headless path does not.
    : {
        headless: !process.argv.includes('--headed'),
        // Keep the GPU on: Chromium's headless GPU path stands down by default, which is why a
        // machine that draws WebGL fine in Chrome still comes back blank here.
        args: [
          '--enable-gpu',
          '--ignore-gpu-blocklist',
          '--enable-unsafe-swiftshader',
          '--disable-gpu-sandbox',
        ],
      },
);
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

// Report which renderer the capture is actually using: a blank shot is nearly always the
// software fallback standing in for the graphics card, and the name says so.
console.log(`mode: ${process.argv.includes('--software') ? 'software' : process.argv.includes('--headed') ? 'headed' : 'headless'}`);
const gpu = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return 'WebGL tidak tersedia';
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log(`renderer: ${gpu}`);

// A page error means the game is broken, and a screenshot of a broken game is worthless.
const problems = [];
page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console error: ${msg.text().slice(0, 200)}`);
});

// Count the distinct shades in an image by decoding it with a 2D canvas, which rasterises
// reliably on any machine. Checking the saved file rather than the GL buffer is deliberate:
// readPixels on a canvas without preserveDrawingBuffer returns nothing once the frame has been
// composited, so a buffer check reports a working scene as blank.
async function shadesIn(page, bytes) {
  const url = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  return page.evaluate(async (source) => {
    const image = new Image();
    const loaded = new Promise((done, fail) => {
      image.onload = done;
      image.onerror = () => fail(new Error('the screenshot did not decode'));
    });
    image.src = source;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const shades = new Set();
    const stride = Math.max(1, Math.floor(data.length / 4 / 6000)) * 4;
    for (let i = 0; i < data.length; i += stride) {
      // 4 bits per channel: coarse enough that JPEG noise does not inflate the count
      shades.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
      if (shades.size > 300) break;
    }
    return { shades: shades.size, width: canvas.width, height: canvas.height };
  }, url);
}

for (const frame of FRAMES) {
  await page.goto(`${base}/?shot=${frame.shot}&seed=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__shotReady === true', { timeout: 30_000 });
  // one more painted frame, so the shot holds the frozen scene rather than a part-drawn one
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  const path = join(OUT, frame.name);
  await page.screenshot({ path, type: 'jpeg', quality: 90 });

  // A real scene is never one flat colour, but the HUD alone can look varied enough to pass a
  // blank canvas off as a render. Hide everything except the WebGL canvas and check that: what
  // remains is the 3D view and nothing else, so a machine that cannot rasterise is caught here
  // rather than by the judge.
  const hideOverlays = await page.addStyleTag({
    content: 'body > *:not(#game) { visibility: hidden !important }',
  });
  const sceneShot = await page.screenshot({ type: 'jpeg', quality: 80 });
  await hideOverlays.evaluate((node) => node.remove());

  const spread = await shadesIn(page, sceneShot);
  if (spread.shades < 6) {
    console.error(`\n${frame.name}: the 3D canvas came out as ${spread.shades} shade(s) of one flat colour.`);
    console.error('The HUD draws but the scene behind it does not, so this shot would read as an empty page.');
    console.error('Try:  node capture.mjs --headed    (a real window usually gets the GPU)');
    console.error('      node capture.mjs --software  (render without a GPU)');
    await browser.close();
    server.close();
    process.exit(3);
  }
  console.log(`captured ${frame.name}  (scene: ${spread.shades} shades, ${spread.width}x${spread.height})`);
}

await browser.close();
server.close();

if (problems.length) {
  console.error('\nThe game reported problems while capturing:');
  for (const line of problems.slice(0, 8)) console.error(`  ${line}`);
  console.error('Fix those first: a screenshot of a page that threw is not a render of the game.');
  process.exit(2);
}

// Verify every screenshot against the rules the gate applies.
let failed = 0;
for (const frame of FRAMES) {
  const path = join(OUT, frame.name);
  const bytes = statSync(path).size;
  const size = jpegSize(readFileSync(path));
  const checks = [];
  if (!size) checks.push('not a whole JPEG');
  if (bytes > 262_144) checks.push(`${bytes} bytes, over 256 KiB`);
  if (size) {
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > 1280) checks.push(`long side ${long}, over 1280`);
    if (short < 480) checks.push(`short side ${short}, under 480`);
  }
  if (checks.length) {
    failed += 1;
    console.log(`FAIL ${frame.name}: ${checks.join('; ')}`);
  } else {
    console.log(`ok   ${frame.name}  ${size.width}x${size.height}  ${(bytes / 1024).toFixed(0)} KiB`);
  }
}

writeFileSync(join(OUT, '.done'), `${new Date().toISOString()}\n`);
console.log(failed ? `\n${failed} screenshot(s) need fixing.` : '\nAll three screenshots pass the gate\'s rules.');
process.exit(failed ? 1 : 0);
