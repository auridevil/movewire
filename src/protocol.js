// Ableton Move control-surface protocol constants and pure helpers.
// Extracted from Live 12's Move remote script (see docs/PROTOCOL.md). Plain USB MIDI + SysEx.

export const MANUFACTURER_ID = [0x00, 0x21, 0x1D];
export const SYSEX_HEADER = [0xF0, ...MANUFACTURER_ID, 0x01, 0x01];
export const ENCODER_LED_HEADER = [...SYSEX_HEADER, 59, 16];
export const IDENTITY_REQUEST = [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7];
export const IDENTITY_ID = [...MANUFACTURER_ID, 88, 50, 1, 0];
export const IDENTITY_RESPONSE_LENGTH = 23;
export const USB = { vendorId: 0x2982, productId: 0x1958, modelName: 'Ableton Move' };

export const CMD = Object.freeze({
  SET_LED_BRIGHTNESS: 6, GET_LED_BRIGHTNESS: 7, WAKE_DISPLAY: 8, SET_POLY_AFTERTOUCH: 30,
  SHUT_DOWN: 57, POWER_STATE: 58, SHUT_DOWN_IMAGE: 65, SET_CONTROL_MODE: 70, GET_CONTROL_MODE: 71,
});
export const MODE = Object.freeze({ CONTROL_SURFACE: 0, STANDALONE: 1 });
export const MODE_NAME = Object.freeze({ 0: 'control_surface', 1: 'standalone' });

export const PAD_FIRST = 68, PAD_COUNT = 32, PAD_COLS = 8, PAD_ROWS = 4;
export const STEP_FIRST = 16, STEP_COUNT = 16;
export const ENCODER_FIRST_CC = 71, ENCODER_COUNT = 8, VOLUME_CC = 79, WHEEL_CC = 14, WHEEL_PUSH_CC = 3;
export const ENCODER_TOUCH_FIRST_NOTE = 0, ENCODER_TOUCH_COUNT = 9, WHEEL_TOUCH_NOTE = 9;

/** Button name -> CC number. */
export const BUTTON = Object.freeze({
  shift: 49, layout: 50, back: 51, capture: 52, minus: 54, plus: 55, undo: 56, loop: 58, duplicate: 60,
  left: 62, right: 63, play: 85, record: 86, mute: 88, sampling: 118, delete: 119,
  track1: 43, track2: 42, track3: 41, track4: 40, // reversed on the wire
});
export const BUTTON_NAME = Object.freeze(Object.fromEntries(Object.entries(BUTTON).map(([k, v]) => [v, k])));

/** LED colour indices (sent as note velocity / CC value). */
export const COLOR = Object.freeze({
  OFF: 0, BRIGHT_RED: 1, BRIGHT_GREEN: 8, WHITE: 120, LIGHT_GREY: 122, DARK_GREY: 123, DIM: 124, BLUE: 125, GREEN: 126, RED: 127,
});
/** index -> 0xRRGGBB, from Move/colors.pyc. */
export const PALETTE = Object.freeze([0,16728114,8389632,13188096,11280128,9195544,4790276,16440379,16762134,11992846,7995160,3457558,5212676,6487893,2719059,2530930,3255807,3564540,1717503,1838310,1391001,3749887,5710591,9907199,8724856,16715826,16722900,10892321,10049064,8873728,9470495,4884224,32530,1594290,6441901,7551591,16301231,16751478,16760671,14266225,16774272,12565097,12373128,11468697,8183199,9024637,8451071,8048380,6857171,8753090,12298994,13482980,15698864,8756620,7042414,8687771,6975605,8947101,7105141,10323356,7629428,10263941,7632234,10323076,7694954,6691092,2164742,4588288,2621440,6100736,2100480,4656128,1837056,3877652,1839882,2428421,853506,6576151,2104327,6704648,2169090,4744709,1515777,3171849,991491,1330440,399618,2045697,659712,2582050,794891,1326633,530704,19766,6158,1262950,398881,1386340,461856,660582,198177,722012,196893,662604,264990,1447526,460577,2231654,721953,3936614,1246497,3476784,1115151,6686228,2163206,6689108,2163995,0,5855577,1710618,16777215,5855577,13421772,4210752,1315860,255,65280,16711680]);
export const paletteHex = (i) => '#' + (PALETTE[i] ?? 0).toString(16).padStart(6, '0');
/** Index of the palette colour closest to a 0xRRGGBB (or '#rrggbb') value. */
export function nearestPaletteIndex(hex) {
  const v = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  const r = v >> 16, g = (v >> 8) & 255, b = v & 255; let best = 0, bd = Infinity;
  PALETTE.forEach((c, i) => { const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

export const sysex = (cmd, ...args) => [...SYSEX_HEADER, cmd, ...args, 0xF7];
export const isMoveSysex = (b) => SYSEX_HEADER.every((x, i) => b[i] === x) && b[b.length - 1] === 0xF7;

export const padIndex = (note) => (note >= PAD_FIRST && note < PAD_FIRST + PAD_COUNT) ? note - PAD_FIRST : -1; // 0 = bottom-left
export const padNote = (index) => PAD_FIRST + index;
export const padRowCol = (index) => ({ row: Math.floor(index / PAD_COLS), col: index % PAD_COLS });
export const padAt = (row, col) => row * PAD_COLS + col;
export const stepIndex = (note) => (note >= STEP_FIRST && note < STEP_FIRST + STEP_COUNT) ? note - STEP_FIRST : -1;
export const encoderIndex = (cc) => (cc >= ENCODER_FIRST_CC && cc < ENCODER_FIRST_CC + ENCODER_COUNT) ? cc - ENCODER_FIRST_CC : -1;
/** Relative encoder value: 1..63 clockwise, 65..127 counter-clockwise. */
export const decodeRelative = (v) => (v < 64 ? v : v - 128);

const from7L7M = (l, m) => l + (m << 7);
const from7L7777M = (d) => d[0] + (d[1] << 7) + (d[2] << 14) + (d[3] << 21) + (d[4] << 28);

/** Parse a universal identity reply. Returns null if not one. */
export function parseIdentity(b) {
  if (b[0] !== 0xF0 || b[1] !== 0x7E || b[3] !== 0x06 || b[4] !== 0x02) return null;
  const r = { idOk: IDENTITY_ID.every((x, i) => b[5 + i] === x), length: b.length, raw: [...b] };
  if (b.length >= IDENTITY_RESPONSE_LENGTH) Object.assign(r, { major: b[10], minor: b[11], build: from7L7M(b[12], b[13]), serial: from7L7777M(b.slice(14, 19)), board: b[19] });
  return r;
}

export const toHex = (a) => [...a].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
