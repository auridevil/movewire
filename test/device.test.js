import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoveDevice, CMD, MODE, IDENTITY_ID, IDENTITY_REQUEST, sysex, BUTTON, COLOR } from '../src/index.js';

class FakeTransport {
  constructor() { this.sent = []; }
  send(bytes) { this.sent.push([...bytes]); }
  last() { return this.sent[this.sent.length - 1]; }
}
const identityReply = [0xF0, 0x7E, 0x7F, 0x06, 0x02, ...IDENTITY_ID, 0x05, 0x01, 0x10, 0x20, 0x30, 0x00, 0x00, 0x02, 0x00, 0x00, 0xF7];
const collect = (device, type) => { const out = []; device.addEventListener(type, (e) => out.push(e.detail)); return out; };

test('requires a transport with send()', () => { assert.throws(() => new MoveDevice({}), TypeError); });

test('connect(): identity → set mode → get mode → cosmetics, and replies are parsed', async () => {
  const t = new FakeTransport(); const d = new MoveDevice(t);
  // simulated Move: answer identity and mode queries asynchronously
  const origSend = t.send.bind(t);
  t.send = (bytes) => {
    origSend(bytes);
    if (bytes[1] === 0x7E) queueMicrotask(() => d.receive(identityReply));
    if (bytes[6] === CMD.GET_CONTROL_MODE) queueMicrotask(() => d.receive(sysex(CMD.GET_CONTROL_MODE, MODE.CONTROL_SURFACE)));
  };
  const res = await d.connect({ timeout: 200 });
  assert.equal(res.identity.idOk, true); assert.equal(res.mode, MODE.CONTROL_SURFACE); assert.equal(d.inControl, true);
  assert.deepEqual(t.sent[0], IDENTITY_REQUEST);
  assert.deepEqual(t.sent[1], sysex(CMD.SET_CONTROL_MODE, MODE.CONTROL_SURFACE));
  assert.deepEqual(t.sent[2], sysex(CMD.GET_CONTROL_MODE));
  assert.deepEqual(t.sent[3], sysex(CMD.WAKE_DISPLAY, 127, 127));
  assert.deepEqual(t.sent[4], sysex(CMD.SET_POLY_AFTERTOUCH, 1));
});

test('connect() re-asks for identity after the mode switch when the first request went unanswered', async () => {
  const t = new FakeTransport(); const d = new MoveDevice(t);
  let inControl = false; const origSend = t.send.bind(t);
  t.send = (bytes) => {
    origSend(bytes);
    if (bytes[6] === CMD.SET_CONTROL_MODE && bytes[7] === MODE.CONTROL_SURFACE) inControl = true;
    if (bytes[6] === CMD.GET_CONTROL_MODE) queueMicrotask(() => d.receive(sysex(CMD.GET_CONTROL_MODE, inControl ? 0 : 1)));
    if (bytes[1] === 0x7E && inControl) queueMicrotask(() => d.receive(identityReply)); // answers identity only in control mode
  };
  const res = await d.connect({ timeout: 30 });
  assert.equal(res.identity?.idOk, true); assert.equal(res.mode, MODE.CONTROL_SURFACE);
  assert.equal(t.sent.filter(m => m[1] === 0x7E).length, 2);
});

test('connect() resolves with null identity on timeout and still switches mode', async () => {
  const t = new FakeTransport(); const d = new MoveDevice(t);
  const res = await d.connect({ timeout: 20 });
  assert.equal(res.identity, null); assert.equal(res.mode, null); assert.equal(d.inControl, true);
  assert.ok(t.sent.some(m => m[6] === CMD.SET_CONTROL_MODE && m[7] === MODE.CONTROL_SURFACE));
});

test('disconnect() clears LEDs then returns the Move to standalone', () => {
  const t = new FakeTransport(); const d = new MoveDevice(t); d.inControl = true;
  d.setPadColor(3, COLOR.RED); t.sent.length = 0;
  d.disconnect();
  assert.ok(t.sent.some(m => m[0] === 0x90 && m[1] === 68 + 3 && m[2] === 0), 'red pad cleared');
  assert.equal(t.sent.length, 32 + 16 + Object.keys(BUTTON).length + 1);   // every pad/step/button zeroed once, then the mode switch
  assert.deepEqual(t.last(), sysex(CMD.SET_CONTROL_MODE, MODE.STANDALONE));
  assert.equal(d.inControl, false);
});

test('LED writes are cached and button names resolve', () => {
  const t = new FakeTransport(); const d = new MoveDevice(t);
  assert.equal(d.setPadColor(0, COLOR.BLUE), true); assert.equal(d.setPadColor(0, COLOR.BLUE), false);
  assert.deepEqual(t.sent, [[0x90, 68, 125]]);
  d.setButtonColor('play', COLOR.GREEN); assert.deepEqual(t.last(), [0xB0, BUTTON.play, 126]);
  d.setButtonColor(BUTTON.record, 1); assert.deepEqual(t.last(), [0xB0, 86, 1]);
  assert.throws(() => d.setButtonColor('nope', 1));
  d.forgetLeds(); assert.equal(d.setPadColor(0, COLOR.BLUE), true);
});

test('incoming messages become typed events', () => {
  const d = new MoveDevice(new FakeTransport(), { now: () => 42 });
  const pads = collect(d, 'pad'), steps = collect(d, 'step'), encs = collect(d, 'encoder'), btns = collect(d, 'button');
  const vol = collect(d, 'volume'), wheel = collect(d, 'wheel'), at = collect(d, 'aftertouch'), touch = collect(d, 'encoderTouch'), unknown = collect(d, 'unknown'), as = collect(d, 'activeSensing');
  d.receive(Uint8Array.from([0x90, 68, 100])); d.receive([0x80, 68, 0]); d.receive([0x90, 99, 0]); // note-on vel 0 = off
  assert.deepEqual(pads[0], { index: 0, row: 0, col: 0, note: 68, on: true, velocity: 100, ch: 1, t: 42 });
  assert.equal(pads[1].on, false); assert.deepEqual([pads[2].index, pads[2].row, pads[2].col, pads[2].on], [31, 3, 7, false]);
  d.receive([0x90, 16, 127]); assert.deepEqual([steps[0].index, steps[0].on], [0, true]);
  d.receive([0xB0, 71, 1]); d.receive([0xB0, 78, 127]); assert.deepEqual([encs[0].index, encs[0].delta, encs[1].index, encs[1].delta], [0, 1, 7, -1]);
  d.receive([0xB0, 79, 2]); assert.equal(vol[0].delta, 2);
  d.receive([0xB0, 14, 126]); assert.equal(wheel[0].delta, -2);
  d.receive([0xB0, 85, 127]); d.receive([0xB0, 85, 0]); assert.deepEqual([btns[0].name, btns[0].pressed, btns[1].pressed], ['play', true, false]);
  d.receive([0xB0, 40, 127]); assert.equal(btns[2].name, 'track4');
  d.receive([0xA0, 70, 55]); assert.deepEqual([at[0].index, at[0].pressure], [2, 55]);
  d.receive([0x90, 3, 127]); assert.deepEqual([touch[0].index, touch[0].on], [3, true]);
  d.receive([0xFE]); assert.equal(as.length, 1);
  d.receive([0xB0, 1, 5]); d.receive([0xC0, 1]); assert.equal(unknown.length, 2);
});

test('sysex replies update state', () => {
  const d = new MoveDevice(new FakeTransport());
  const modes = collect(d, 'mode'), replies = collect(d, 'reply'), ids = collect(d, 'identity');
  d.receive(sysex(CMD.GET_CONTROL_MODE, MODE.STANDALONE)); assert.equal(d.mode, 1); assert.deepEqual(modes, [1]);
  d.receive(sysex(CMD.GET_LED_BRIGHTNESS, 77)); assert.equal(d.brightness, 77); assert.deepEqual(replies[1], { cmd: 7, args: [77] });
  d.receive(identityReply); assert.equal(ids[0].idOk, true); assert.equal(d.identity.build, 133);
});

test('refreshLeds re-sends cached values; keep-alive pings and refreshes until disconnect', async () => {
  const t = new FakeTransport(); const d = new MoveDevice(t); d.inControl = true;
  d.setPadColor(2, COLOR.BLUE); d.setButtonColor('play', COLOR.GREEN); t.sent.length = 0;
  d.refreshLeds();
  assert.deepEqual(t.sent.sort(), [[0x90, 70, 125], [0xB0, 85, 126]].sort());
  t.sent.length = 0; d.startKeepAlive(15); await new Promise(r => setTimeout(r, 40));
  assert.ok(t.sent.some(m => m[6] === CMD.SET_POLY_AFTERTOUCH), 'pinged'); assert.ok(t.sent.filter(m => m[0] === 0x90 && m[1] === 70).length >= 2, 'LEDs refreshed more than once');
  d.disconnect(); const n = t.sent.length; await new Promise(r => setTimeout(r, 40)); assert.equal(t.sent.length, n, 'keep-alive stopped');
});
