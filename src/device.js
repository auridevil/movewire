// MoveDevice: transport-agnostic driver for the Ableton Move in control-surface mode.
// Feed it raw incoming MIDI bytes with receive(); it sends through transport.send(bytes).
// Events (CustomEvent.detail):
//   pad {index,row,col,note,on,velocity,t}   aftertouch {index,pressure,t}   step {index,on,velocity,t}
//   encoder {index,cc,delta,value,t}  volume {delta}  wheel {delta}  wheelPush {pressed}  encoderTouch {index,on}  wheelTouch {on}
//   button {name,cc,pressed,value,t}  identity {…}  mode (0|1)  reply {cmd,args}  activeSensing  unknown {bytes}  sent {bytes}
import * as P from './protocol.js';

export class MoveDevice extends EventTarget {
  constructor(transport, { now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
    super();
    if (!transport || typeof transport.send !== 'function') throw new TypeError('transport must have send(bytes)');
    this.transport = transport; this.now = now;
    this.identity = null; this.mode = null; this.brightness = null; this.inControl = false;
    this.ledState = new Map(); this.sysexBuffer = null;
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  send(bytes) { this.transport.send(bytes); this.emit('sent', { bytes }); }

  // ---- commands ----
  identify() { this.send(P.IDENTITY_REQUEST); }
  getMode() { this.send(P.sysex(P.CMD.GET_CONTROL_MODE)); }
  setMode(mode) { this.send(P.sysex(P.CMD.SET_CONTROL_MODE, mode)); }
  wakeDisplay() { this.send(P.sysex(P.CMD.WAKE_DISPLAY, 127, 127)); }
  setPolyAftertouch(on = true) { this.send(P.sysex(P.CMD.SET_POLY_AFTERTOUCH, on ? 1 : 0)); }
  setLedBrightness(v) { this.send(P.sysex(P.CMD.SET_LED_BRIGHTNESS, v & 0x7F)); }
  getLedBrightness() { this.send(P.sysex(P.CMD.GET_LED_BRIGHTNESS)); }
  getPowerState() { this.send(P.sysex(P.CMD.POWER_STATE)); }

  /** Live's handshake: identity → control mode → cosmetics. Resolves {identity, mode}; identity null on timeout. */
  async connect({ timeout = 1500, keepAlive = 2000 } = {}) {
    this.identity = null;
    this.identify();
    let identity = await this.waitFor('identity', timeout);
    this.setMode(P.MODE.CONTROL_SURFACE);
    this.getMode();
    const mode = await this.waitFor('mode', timeout);
    this.inControl = mode === P.MODE.CONTROL_SURFACE || mode === null;
    if (!identity) { this.identify(); identity = await this.waitFor('identity', timeout); } // some units only answer once in control mode
    if (this.inControl) { this.wakeDisplay(); this.setPolyAftertouch(true); if (keepAlive) this.startKeepAlive(keepAlive); }
    this.emit('connected', { identity, mode });
    return { identity, mode };
  }

  /** Periodically re-send every cached LED value and a harmless SysEx, so lights survive the Move's idle timeouts. */
  startKeepAlive(everyMs = 2000) {
    this.stopKeepAlive();
    this._keepAlive = setInterval(() => { if (!this.inControl) return; this.setPolyAftertouch(true); this.refreshLeds(); }, everyMs);
    this._keepAlive.unref?.(); // never keep a Node process alive just for this
  }
  stopKeepAlive() { if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; } }
  refreshLeds() { for (const [key, color] of this.ledState) this.send([Math.floor(key / 256), key % 256, color & 0x7F]); }

  /** Clear LEDs and hand the Move back to standalone. */
  disconnect() {
    this.stopKeepAlive();
    if (this.inControl) this.clearLeds();
    this.setMode(P.MODE.STANDALONE);
    this.inControl = false; this.emit('disconnected');
  }

  waitFor(type, ms) {
    return new Promise((resolve) => {
      const done = (v) => { clearTimeout(timer); this.removeEventListener(type, handler); resolve(v); };
      const handler = (e) => done(e.detail);
      const timer = setTimeout(() => done(null), ms);
      this.addEventListener(type, handler);
    });
  }

  // ---- LEDs (cached: only changed values are sent) ----
  setPadColor(index, color) { return this.led(0x90, P.padNote(index), color); }
  setStepColor(index, color) { return this.led(0x90, P.STEP_FIRST + index, color); }
  setButtonColor(name, color) { const cc = typeof name === 'number' ? name : P.BUTTON[name]; if (cc == null) throw new Error(`unknown button ${name}`); return this.led(0xB0, cc, color); }
  led(status, id, color) {
    const key = status * 256 + id;
    if (this.ledState.get(key) === color) return false;
    this.ledState.set(key, color); this.send([status, id, color & 0x7F]); return true;
  }
  clearLeds() {
    for (let i = 0; i < P.PAD_COUNT; i++) this.setPadColor(i, 0);
    for (let i = 0; i < P.STEP_COUNT; i++) this.setStepColor(i, 0);
    for (const cc of Object.values(P.BUTTON)) this.led(0xB0, cc, 0);
  }
  forgetLeds() { this.ledState.clear(); }
  async ledTest(delay = 40, sleep = (ms) => new Promise(r => setTimeout(r, ms))) {
    for (let c = 0; c < 128; c++) { this.setPadColor(c % P.PAD_COUNT, c); await sleep(delay); }
    for (let i = 0; i < P.PAD_COUNT; i++) this.setPadColor(i, 0);
  }

  // ---- incoming ----
  /** Feed raw MIDI bytes (one message per call, as Web MIDI delivers them). */
  receive(bytes, t = this.now()) {
    const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    const s = b[0];
    if (s === 0xF0) return this.onSysex([...b]);
    if (s === 0xFE) return this.emit('activeSensing', { t });
    if (s >= 0xF0) return this.emit('unknown', { bytes: [...b], t });
    const type = s & 0xF0, ch = (s & 0x0F) + 1, d1 = b[1], d2 = b[2];
    if (type === 0x90 || type === 0x80) return this.onNote(d1, type === 0x90 && d2 > 0, d2, ch, t);
    if (type === 0xA0) { const i = P.padIndex(d1); if (i >= 0) return this.emit('aftertouch', { index: i, note: d1, pressure: d2, t }); }
    if (type === 0xB0) return this.onCC(d1, d2, ch, t);
    this.emit('unknown', { bytes: [...b], t });
  }

  onNote(note, on, velocity, ch, t) {
    const pad = P.padIndex(note);
    if (pad >= 0) return this.emit('pad', { index: pad, ...P.padRowCol(pad), note, on, velocity, ch, t });
    const step = P.stepIndex(note);
    if (step >= 0) return this.emit('step', { index: step, on, velocity, t });
    if (note === P.WHEEL_TOUCH_NOTE) return this.emit('wheelTouch', { on, t });
    if (note >= P.ENCODER_TOUCH_FIRST_NOTE && note < P.ENCODER_TOUCH_FIRST_NOTE + P.ENCODER_TOUCH_COUNT) return this.emit('encoderTouch', { index: note - P.ENCODER_TOUCH_FIRST_NOTE, on, t });
    this.emit('unknown', { bytes: [on ? 0x90 : 0x80, note, velocity], t });
  }

  onCC(cc, value, ch, t) {
    const enc = P.encoderIndex(cc);
    if (enc >= 0) return this.emit('encoder', { index: enc, cc, delta: P.decodeRelative(value), value, t });
    if (cc === P.VOLUME_CC) return this.emit('volume', { delta: P.decodeRelative(value), value, t });
    if (cc === P.WHEEL_CC) return this.emit('wheel', { delta: P.decodeRelative(value), value, t });
    if (cc === P.WHEEL_PUSH_CC) return this.emit('wheelPush', { pressed: value > 0, value, t });
    const name = P.BUTTON_NAME[cc];
    if (name) return this.emit('button', { name, cc, pressed: value > 0, value, t });
    this.emit('unknown', { bytes: [0xB0, cc, value], t });
  }

  onSysex(b) {
    const id = P.parseIdentity(b);
    if (id) { this.identity = id; return this.emit('identity', id); }
    if (P.isMoveSysex(b)) {
      const cmd = b[6], args = b.slice(7, -1);
      if (cmd === P.CMD.GET_CONTROL_MODE || cmd === P.CMD.SET_CONTROL_MODE) { this.mode = args[0]; this.emit('mode', args[0]); }
      if (cmd === P.CMD.GET_LED_BRIGHTNESS) this.brightness = args[0];
      return this.emit('reply', { cmd, args });
    }
    this.emit('unknown', { bytes: b });
  }
}
