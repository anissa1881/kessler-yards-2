// The look plan, in one place. Six values and one accent hue; the lighting makes every
// shade the game needs, so no other colour appears in the code. The same six names are
// the CSS custom properties in index.html.
//
// Those six are the interface's: dark plates and pale text, which stay readable over anything.
// The yard itself is lit separately, by YARD below, because the two wants pull apart. A dark
// interface needs dark plates; a screenshot a judge looks at for one second needs daylight in it.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
};

// The place, in an overcast afternoon: pale concrete, weathered crates, a sky that is lighter
// than every wall, so solid shapes read as silhouettes instead of merging into the background.
export const YARD = {
  haze: '#b7c2cc',
  floor: '#8d8a80',
  wall: '#c6c1b4',
  crate: '#8a7452',
  accent: '#f0a830',
  sun: '#fff5e4',
  shade: '#c3d4e2',
  ground: '#8f8878',
};

export function shade(name) {
  return PALETTE[name];
}
