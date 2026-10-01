import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/protocol.js';

test('sysex frames use the Move header and F7 terminator', () => {
  assert.deepEqual(P.sysex(P.CMD.SET_CONTROL_MODE, P.MODE.CONTROL_SURFACE), [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 70, 0, 0xF7]);
  assert.deepEqual(P.sysex(P.CMD.GET_CONTROL_MODE), [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 71, 0xF7]);
  assert.deepEqual(P.sysex(P.CMD.WAKE_DISPLAY, 127, 127), [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 8, 127, 127, 0xF7]);
  assert.equal(P.isMoveSysex(P.sysex(1)), true);
  assert.equal(P.isMoveSysex([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]), false);
});

test('identity request/response', () => {
  assert.deepEqual(P.IDENTITY_REQUEST, [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);
  const reply = [0xF0, 0x7E, 0x7F, 0x06, 0x02, ...P.IDENTITY_ID, 0x05, 0x01, 0x10, 0x20, 0x30, 0x00, 0x00, 0x02, 0x00, 0x00, 0xF7];
  assert.equal(reply.length, P.IDENTITY_RESPONSE_LENGTH);
  const id = P.parseIdentity(reply);
  assert.equal(id.idOk, true);
  assert.equal(id.major, 1); assert.equal(id.minor, 0);
  assert.equal(id.build, 5 + (1 << 7));
  assert.equal(id.serial, 0x10 + (0x20 << 7) + (0x30 << 14));
  assert.equal(id.board, 2);
  assert.equal(P.parseIdentity([0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 71, 0, 0xF7]), null);
  const wrong = [...reply]; wrong[8] = 0x11;
  assert.equal(P.parseIdentity(wrong).idOk, false);
});

test('pad, step and encoder mapping', () => {
  assert.equal(P.padIndex(68), 0); assert.equal(P.padIndex(99), 31); assert.equal(P.padIndex(67), -1); assert.equal(P.padIndex(100), -1);
  assert.equal(P.padNote(0), 68); assert.deepEqual(P.padRowCol(0), { row: 0, col: 0 }); assert.deepEqual(P.padRowCol(31), { row: 3, col: 7 });
  assert.equal(P.padAt(3, 7), 31);
  assert.equal(P.stepIndex(16), 0); assert.equal(P.stepIndex(31), 15); assert.equal(P.stepIndex(32), -1);
  assert.equal(P.encoderIndex(71), 0); assert.equal(P.encoderIndex(78), 7); assert.equal(P.encoderIndex(79), -1);
});

test('relative encoder decoding', () => {
  assert.equal(P.decodeRelative(1), 1); assert.equal(P.decodeRelative(63), 63);
  assert.equal(P.decodeRelative(127), -1); assert.equal(P.decodeRelative(65), -63); assert.equal(P.decodeRelative(120), -8);
});

test('buttons and palette', () => {
  assert.equal(P.BUTTON.play, 85); assert.equal(P.BUTTON_NAME[85], 'play'); assert.equal(P.BUTTON_NAME[43], 'track1');
  assert.equal(P.PALETTE.length, 128);
  assert.equal(P.paletteHex(P.COLOR.RED), '#ff0000'); assert.equal(P.paletteHex(P.COLOR.GREEN), '#00ff00');
  assert.equal(P.paletteHex(P.COLOR.BLUE), '#0000ff'); assert.equal(P.paletteHex(P.COLOR.WHITE), '#ffffff'); assert.equal(P.paletteHex(0), '#000000');
  assert.equal(P.toHex([0xF0, 0x00, 0xF7]), 'F0 00 F7');
});
