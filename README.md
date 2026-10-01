# movewire

**Wire an Ableton Move to JavaScript.** movewire speaks the Move's own control‑surface protocol (the one Live uses)
over Web MIDI or any MIDI transport you give it: the identity handshake, switching the Move into controller mode,
typed events for the 32 pads, 16 step buttons, knobs, wheel and buttons, and full LED control. **Zero dependencies,
no firmware modification, no warranty impact.**

- Browser: Chrome / Edge with Web MIDI (SysEx must be allowed).
- Node: use any MIDI library as the transport (tests run without hardware).
- Verified on a real Move, firmware 2.x. Protocol reference: [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

## Install
```sh
npm install github:auridevil/movewire      # until the first npm release
```
In a plain browser page without a bundler, add an import map:
```html
<script type="importmap">
{ "imports": { "movewire": "./node_modules/movewire/src/index.js", "movewire/web-midi": "./node_modules/movewire/src/web-midi.js" } }
</script>
```

## Use (browser)
```js
import { openMove } from 'movewire/web-midi';
import { COLOR } from 'movewire';

const { device, release } = await openMove();      // finds the "Ableton Move" ports, asks for SysEx
await device.connect();                            // identity → control-surface mode → keep-alive

device.addEventListener('pad', ({ detail: p }) => {           // index 0 = bottom-left; row, col, on, velocity
  device.setPadColor(p.index, p.on ? COLOR.WHITE : COLOR.OFF);
});
device.addEventListener('encoder', ({ detail: e }) => console.log('knob', e.index + 1, e.delta));
device.addEventListener('button', ({ detail: b }) => b.name === 'play' && b.pressed && console.log('play!'));
device.setButtonColor('play', COLOR.GREEN);

// later
device.disconnect();                               // LEDs off, Move back to standalone
release();
```

## Use (any transport)
```js
import { MoveDevice } from 'movewire';
const device = new MoveDevice({ send: (bytes) => output.send(bytes) });   // node-midi, WebSocket bridge, tests…
input.on('message', (bytes) => device.receive(bytes));
await device.connect();
```

## API
**`MoveDevice(transport, { now })`** — `transport.send(bytes)` is the only requirement.

| Method | What it does |
|---|---|
| `connect({ timeout, keepAlive })` → `{identity, mode}` | identity request, control‑surface mode, display wake, poly‑aftertouch; re‑asks identity after the mode switch; starts a keep‑alive that re‑sends LED state every 2 s |
| `disconnect()` | clears LEDs, stops keep‑alive, hands the Move back to standalone |
| `identify()` `getMode()` `setMode(MODE.*)` `wakeDisplay()` `setPolyAftertouch(on)` `setLedBrightness(v)` `getLedBrightness()` `getPowerState()` | raw commands |
| `setPadColor(i, color)` `setStepColor(i, color)` `setButtonColor(name, color)` `clearLeds()` `forgetLeds()` `refreshLeds()` `ledTest()` | LEDs; writes are cached so only changes reach the wire |
| `receive(bytes, t?)` | feed incoming MIDI |

**Events** (`CustomEvent.detail`): `pad {index,row,col,note,on,velocity,t}` · `aftertouch {index,pressure}` · `step {index,on,velocity}` · `encoder {index,cc,delta,value}` · `volume {delta}` · `wheel {delta}` · `wheelPush {pressed}` · `encoderTouch {index,on}` · `wheelTouch {on}` · `button {name,cc,pressed}` · `identity` · `mode` · `reply {cmd,args}` · `activeSensing` · `unknown {bytes}` · `sent {bytes}` · `connected` · `disconnected`.

**Protocol exports:** `CMD`, `MODE`, `BUTTON`, `COLOR`, `PALETTE`, `paletteHex(i)`, `nearestPaletteIndex(hex)`, `sysex(cmd, …args)`, `parseIdentity(bytes)`, `padIndex(note)`, `padNote(i)`, `padRowCol(i)`, `padAt(row, col)`, `decodeRelative(v)`, `toHex(bytes)`.

**Colours:** LED values are indices into the Move's 128‑entry palette (`PALETTE`, `paletteHex`). `nearestPaletteIndex('#67e8f9')` picks the closest entry to a screen colour so hardware and UI match. Useful constants in `COLOR` (`OFF`, `WHITE`, `RED`, `GREEN`, `BLUE`, `BRIGHT_RED`, `BRIGHT_GREEN`, `LIGHT_GREY`, `DARK_GREY`, `DIM`).

## Notes
- In control‑surface mode the Move's own synth is silent; your app makes the sound.
- Quit Live before connecting: it claims the ports and does the same handshake.
- Knobs are relative encoders (±steps), not absolute CCs.
- The display can be driven over SysEx too; that part of the protocol is not implemented yet (PRs welcome).

## Test
```sh
npm run check && npm test
```

## Contributing & licence
See [CONTRIBUTING.md](CONTRIBUTING.md). MIT. Not affiliated with Ableton; the protocol was read from Live's own
Move remote script and confirmed on hardware.
