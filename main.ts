// The entry program for best-game-01 (Node 22, standard library only).
//
// It hands the game in. Four things happen, in this order, and nothing is copied until all four
// have passed:
//
//   1. the layout is checked - game/, game/index.html and screenshots/ are where they must be;
//   2. the screenshots are counted and weighed, because the scorer wants three or four of them,
//      each a whole JPEG or PNG under 256 KiB;
//   3. game/ is walked and weighed against the intake's caps, so a bloated build is a sentence
//      here rather than a refusal later that names the wrong reason;
//   4. the game and the screenshots are copied to the output directory, and dossier.json is
//      written from them with the kit's own library, which is the only way the file can match
//      what the gate builds again for itself.
//
// Every refusal says which file is wrong and what to do about it. Nothing here guesses: a check
// that cannot be made is an error, never a silent pass.
//
// Serve the game locally with `node serve.ts` and open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// The scorer's own caps, from the kit's reference/gate.json.
const TEXT_MAX_BYTES = 163840;
const ENTRY_MAX_FILES = 1000;
const ENTRY_MAX_BYTES = 67108864;
const SHOT_MIN = 3;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 262144;
const SHOT_LONG_SIDE = 1280;
const SHOT_SHORT_SIDE = 480;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;

/** The two formats a screenshot may be, and how each one announces itself. */
const IMAGE_SIGNATURES = [
  { ext: '.jpg', label: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', label: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png', label: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
];

/** Stop with a message that says which file is wrong and what to do about it. */
function refuse(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

/**
 * Whether the file's first bytes are one of the signatures above. A screenshot that is really a
 * PNG under a .jpg name is refused by the scorer, so it is caught here first.
 */
function imageFormat(path) {
  const head = readFileSync(path, { encoding: null }).subarray(0, 4);
  for (const signature of IMAGE_SIGNATURES) {
    if (signature.bytes.every((byte, index) => head[index] === byte)) return signature.label;
  }
  return null;
}

/**
 * The pixel size of a JPEG or PNG, read from its own header. Only the few bytes each format puts
 * its size in are touched, so a 250 KiB screenshot is not decoded to find out how big it is.
 */
function imageSize(path) {
  const data = readFileSync(path);
  // PNG: IHDR is always the first chunk, at a fixed offset, big-endian.
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  // JPEG: walk the segments to the start-of-frame, which carries the size.
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      // SOF0..SOF15, except the three markers that are not frames.
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(gameDir)) refuse('game/ is missing next to main.ts: the entry has nothing to hand in.');
if (!existsSync(join(gameDir, 'index.html'))) {
  refuse('game/index.html is missing: the scorer opens that file to read the game.');
}
if (!existsSync(shotsDir)) {
  refuse(`screenshots/ is missing: threejs-fps-01 needs ${SHOT_MIN} to ${SHOT_MAX} screenshots of the game.`);
}

// The screenshots: counted the way the scorer opens them, then checked one at a time.
const shotNames = readdirSync(shotsDir)
  .filter((name) => !name.startsWith('.'))
  .sort();
if (shotNames.length < SHOT_MIN || shotNames.length > SHOT_MAX) {
  refuse(
    `screenshots/ holds ${shotNames.length} files, but threejs-fps-01 wants ${SHOT_MIN} to ${SHOT_MAX}. ` +
      `It has: ${shotNames.join(', ') || '(nothing)'}.`,
  );
}

let shotBytes = 0;
for (const name of shotNames) {
  const path = join(shotsDir, name);
  if (!statSync(path).isFile()) refuse(`screenshots/${name} is not a regular file: the scorer reads files only.`);
  if (!IMAGE_SIGNATURES.some((signature) => signature.ext === extname(name).toLowerCase())) {
    refuse(`screenshots/${name} is not named .jpg, .jpeg or .png: the scorer only reads those two formats.`);
  }
  const bytes = statSync(path).size;
  shotBytes += bytes;
  if (bytes > SHOT_MAX_BYTES) {
    refuse(`screenshots/${name} is ${bytes} bytes, over the ${SHOT_MAX_BYTES}-byte cap: shrink it.`);
  }
  if (imageFormat(path) === null) {
    refuse(`screenshots/${name} does not start like a JPEG or a PNG: it is a whole image, not a fragment.`);
  }
  const size = imageSize(path);
  if (size === null) refuse(`screenshots/${name}: its own header does not say how big it is, so it is not a whole image.`);
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  if (long > SHOT_LONG_SIDE || short < SHOT_SHORT_SIDE) {
    refuse(
      `screenshots/${name} is ${size.width}x${size.height}: the scorer wants a long side of at most ` +
        `${SHOT_LONG_SIDE} and a short side of at least ${SHOT_SHORT_SIDE}.`,
    );
  }
}

// The game, counted as files and bytes before copying, so a bloated build is caught here.
function weigh(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = weigh(path);
      files += nested.files;
      bytes += nested.bytes;
    } else {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const game = weigh(gameDir);
if (game.files > GAME_MAX_FILES) {
  refuse(`game/ holds ${game.files} files, over the ${GAME_MAX_FILES}-file cap.`);
}
if (game.bytes > GAME_MAX_BYTES) {
  refuse(`game/ holds ${game.bytes} bytes, over the ${GAME_MAX_BYTES}-byte cap.`);
}
// The output shares one cap between the game, the screenshots and the dossier, so it is worth
// knowing here rather than at the gate: one dossier on top would be over.
const dossierAllowance = 1572864;
if (game.files + shotNames.length + 1 > ENTRY_MAX_FILES) {
  refuse(`the entry would hold ${game.files + shotNames.length + 1} entries, over the ${ENTRY_MAX_FILES} cap.`);
}
if (game.bytes + shotBytes + dossierAllowance > ENTRY_MAX_BYTES) {
  refuse(`the entry would hold about ${game.bytes + shotBytes + dossierAllowance} bytes, over the ${ENTRY_MAX_BYTES} cap.`);
}

// Everything checks out: copy, then write the dossier from what was copied.
mkdirSync(join(out, 'game'), { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: SHOT_MAX, max_bytes: SHOT_MAX_BYTES },
  game_max_files: GAME_MAX_FILES,
  game_max_bytes: GAME_MAX_BYTES,
});
const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, dossier);

const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;
console.log(
  `handed in ${game.files} game files (${kib(game.bytes)}) and ${shotNames.length} screenshots ` +
    `(${shotNames.join(', ')}, ${kib(shotBytes)}) to ${out}`,
);
console.log(`dossier.json: ${statSync(dossierPath).size} bytes`);
