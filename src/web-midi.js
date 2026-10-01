// Web MIDI adapter: finds the Move's ports and wires them to a MoveDevice.
import { MoveDevice } from './device.js';

export const isMovePort = (p) => /move/i.test(p.name || '');

/** Request Web MIDI access (SysEx preferred, falls back). Returns { access, sysex }. */
export async function requestAccess() {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) throw new Error('Web MIDI not supported (use Chrome/Edge)');
  try { return { access: await navigator.requestMIDIAccess({ sysex: true }), sysex: true }; }
  catch { return { access: await navigator.requestMIDIAccess({ sysex: false }), sysex: false }; }
}

export function findMovePorts(access) {
  const input = [...access.inputs.values()].find(isMovePort) || null;
  const output = (input && [...access.outputs.values()].find(o => o.name === input.name)) || [...access.outputs.values()].find(isMovePort) || null;
  return { input, output };
}

/**
 * Create a MoveDevice bound to Web MIDI ports. Returns { device, input, output, sysex, release }.
 * Pass explicit ports to override auto-detection. Incoming messages are forwarded to device.receive().
 */
export async function openMove({ access, input, output } = {}) {
  let sysex = true;
  if (!access) ({ access, sysex } = await requestAccess());
  if (!input || !output) { const found = findMovePorts(access); input ??= found.input; output ??= found.output; }
  if (!input || !output) throw new Error('Ableton Move MIDI ports not found (is it connected over USB-C, and is Live closed?)');
  const device = new MoveDevice({ send: (bytes) => output.send(bytes) });
  const onMessage = (e) => device.receive(e.data, e.timeStamp);
  input.addEventListener('midimessage', onMessage);
  const release = () => input.removeEventListener('midimessage', onMessage);
  return { device, input, output, sysex, release };
}
