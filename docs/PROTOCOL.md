# Move "Control Live" protocol (extracted 2026-09-30)

Source: Live 12 Intro's bundled `MIDI Remote Scripts/Move/*.pyc` (Python 3.11 bytecode; constants read via
`marshal`/`dis`, not decompiled). This is Ableton's own control-surface protocol — plain USB MIDI + SysEx,
**no firmware modification**. To be verified on the device (marked ⚠️).

## Handshake (what Live does)
1. Universal identity request: `F0 7E 7F 06 01 F7`
2. Expect identity reply containing `00 21 1D 58 32 01 00` (Ableton manufacturer id `00 21 1D` + `(88,50,1,0)`), 23 bytes total ⚠️; tail carries firmware (XMOS maj.min build), serial, board revision.
3. Send **set control mode** SysEx → `control_surface` (0). Standalone = 1.
4. Optional: wake display, poly-aftertouch mode, LED brightness.
5. On disconnect: set control mode → standalone (1).

USB ids: vendor `0x2982` (10626), product `0x1958` (6488), model name "Ableton Move".

## SysEx frame
`F0 00 21 1D 01 01 <cmd> <args…> F7` ⚠️ (header = manufacturer id + `(1,1)`; verify byte order on device)

| cmd | meaning | args |
|---|---|---|
| 6 | set LED brightness | `(brightness)` |
| 7 | get LED brightness | — |
| 8 | wake up display | `(127,127)` |
| 30 | set poly-aftertouch mode | `(1)` |
| 57 | shut down / clear power-button event | `(6)` / `(2)` |
| 58 | get power state | — |
| 65 | shut-down image | `(1,0)` |
| **70** | **set control mode** | `(0=control_surface, 1=standalone)` |
| 71 | get control mode | — (reply mirrors frame with mode byte) |

## Controls → MIDI (channel 1 unless noted)
| Control | Type | Numbers |
|---|---|---|
| 32 pads | note | **68–99**, bottom-left → top-right, 8 per row (`create_matrix_identifiers(68,100,8)`) |
| 16 step buttons | note | 16–31 (4 rows of 4: 16–19, 20–23, 24–27, 28–31) |
| Encoders 1–8 | CC, relative | **71–78** |
| Volume encoder | CC, relative | 79 |
| Wheel (jog) | CC, relative | 14 |
| Encoder touch 1–9 | note | 0–8 |
| Wheel touch | note | 9 |
| Wheel push | CC | 3 |
| Track state buttons | CC | 40–43 |
| Shift | CC | 49 |
| Layout / Back / Capture | CC | 50 / 51 / 52 |
| Minus / Plus / Undo / Loop | CC | 54 / 55 / 56 / 58 |
| Duplicate | CC | 60 |
| Left / Right | CC | 62 / 63 |
| Play / Record / Mute | CC | 85 / 86 / 88 |
| Sampling / Delete | CC | 118 / 119 |

Relative encoders: `1–63` = clockwise steps, `65–127` = counter-clockwise (two's complement style).

## LEDs
Send the same note/CC back with **velocity/value = colour index** (0–127). Palette (index → RGB) is in
`Move/colors.pyc`; useful ones: `0` off, `127` red, `126` green, `125` blue, `120` white, `122` light grey,
`123` dark grey, `1` bright red, `8` bright green (see Move Everything constants for the same table).
Animated colours use channels: base channel + speed (channel 2..). ⚠️

## Display
`DisplayElement` speaks SysEx too (128×64 mono); protocol not extracted yet.

## Caveats
- In control-surface mode Move's **own synth engine is silent** — the browser must make the sound (WebAudio).
- Without the handshake Move only emits active sensing (community reports).
- Whether the SysEx alone flips the mode, or the user must first pick *Control Live* in Setup (Shift+Step 2), is ⚠️ to test.
