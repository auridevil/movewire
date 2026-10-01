# Contributing to movewire

Thanks for helping wire the Move to the web. The bar is simple: **every protocol fact must be verified on a
real Move**, and **every change ships with a test**.

## Ground rules
- Zero runtime dependencies. The library must keep running in a browser from a plain `<script type="module">`
  and in Node for tests.
- `MoveDevice` stays **transport-agnostic**: it only knows `transport.send(bytes)` and `receive(bytes)`.
  Browser specifics live in `src/web-midi.js`; anything app-specific (music theory, UI, games) does not belong here.
- Public API changes go through a short discussion in an issue first.
- No reverse-engineering notes without the evidence: when you document a SysEx command or a control number,
  say how you confirmed it (Live's `Move` remote script, a MIDI capture, a firmware version) in `docs/PROTOCOL.md`.

## Development
```sh
npm run check   # syntax check every file (node --check)
npm test        # node --test, no dependencies
```
Node 18+ is required. Tests must not touch real hardware: use the `FakeTransport` pattern from `test/device.test.js`.

## Adding a control, command or LED behaviour
1. Add the constant to `src/protocol.js` with a one-line comment on where it comes from.
2. Decode / encode it in `src/device.js`; emit a typed event with a stable `detail` shape.
3. Cover it in `test/protocol.test.js` or `test/device.test.js` (frame bytes in, event out).
4. Document it in `docs/PROTOCOL.md` and, if user-facing, in `README.md`.

## Pull requests
- One topic per PR, small and reviewable.
- Describe what you tested on hardware (firmware version from the identity reply, what worked, what did not).
- Keep the style: ES modules, no build step, short functions, comments only where the protocol is not obvious.

## Reporting hardware findings
Open an issue titled `protocol: <what you found>` with the raw bytes (`toHex()` output is fine), the Move
firmware version and the Live version if the finding comes from Live's remote script. Findings are as valuable as code.

## Legal
movewire is not affiliated with, endorsed by or supported by Ableton. It talks to the Move through Ableton's own
control-surface protocol over standard MIDI, without modifying the device. Contributions are accepted under the MIT licence.
