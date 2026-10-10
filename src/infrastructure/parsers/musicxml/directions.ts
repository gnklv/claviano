import { dynamicWords, isDynamicLetters, type DynamicMark, type Hairpin } from '../../../domain/notation/dynamics';
import type { BarNavigation } from '../../../domain/notation/navigation';
import { isWords, type WordsMark } from '../../../domain/notation/words';
import { softPedalWords, type PedalKind, type PedalMark } from '../../../domain/pedal';
import type { TempoMark } from '../../../domain/score';
import { NOTE_TYPES } from './notes';
import { childNumber, childText } from './xml';

/* What a <direction> or a <sound> says: repeats and jumps, dynamics, the metronome mark, pedals. */

export type MutableNavigation = { -readonly [K in keyof BarNavigation]: BarNavigation[K] };

/** Repeat marks and jumps a <direction> or <sound> carries. */
export function readNavigation(element: Element, sound: Element | null | undefined, nav: MutableNavigation): void {
  const types = element.querySelector(':scope > direction-type');
  if (types?.querySelector(':scope > segno')) nav.segnoSign = true;
  if (types?.querySelector(':scope > coda')) nav.codaSign = true;
  if (!sound) return;
  if (sound.getAttribute('segno')) nav.segno = true;
  if (sound.getAttribute('coda')) nav.coda = true;
  const jumps = {
    dacapo: sound.getAttribute('dacapo') === 'yes',
    dalsegno: !!sound.getAttribute('dalsegno'),
    fine: sound.getAttribute('fine') !== null,
    toCoda: !!sound.getAttribute('tocoda'),
  };
  if (jumps.dacapo) nav.jump = 'dacapo';
  if (jumps.dalsegno) nav.jump = 'dalsegno';
  if (jumps.fine) nav.fine = true;
  if (jumps.toCoda) nav.toCoda = true;
  // The words that go with a jump ("D.C. al Fine", "To Coda") are printed over the bar.
  const words = [...(types?.querySelectorAll(':scope > words') ?? [])].map((w) => w.textContent?.trim()).filter(Boolean);
  if ((jumps.dacapo || jumps.dalsegno || jumps.fine || jumps.toCoda) && words.length > 0) nav.text = words.join(' ');
}

/**
 * The words a <direction> carries, other than those read elsewhere: dynamics ("cresc."), the left
 * pedal ("una corda"), the words of a jump. Bold words, and words that set the tempo, are a tempo.
 */
export function readWords(direction: Element, sound: Element | null | undefined, beat: number, isJump: boolean): WordsMark[] {
  if (isJump) return [];
  const below = direction.getAttribute('placement') === 'below';
  const setsTempo = Number(sound?.getAttribute('tempo')) > 0;
  return [...direction.querySelectorAll(':scope > direction-type > words')].flatMap((words) => {
    const text = words.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!isWords(text) || dynamicWords(text) || softPedalWords(text) !== null || words.getAttribute('print-object') === 'no') return [];
    // Bold is a tempo; so are plain words that set one ("Adagio"), unless the file prints them as something else.
    const weight = words.getAttribute('font-weight');
    const plain = weight === null && words.getAttribute('font-style') !== 'italic';
    return [{ beat, text, tempo: weight === 'bold' || (setsTempo && plain), below }];
  });
}

/**
 * The dynamics a <direction> carries: printed marks (pp, mf, sfz…), the words "cresc." / "dim.",
 * and hairpins (<wedge>). When the file gives its own level (<sound dynamics>, `soundLevel`), the
 * marks carry it in place of their usual one.
 */
export function readDynamics(
  direction: Element,
  beat: number,
  soundLevel: number | null,
  open: Map<string, { start: number; type: Hairpin['type']; below: boolean }>,
): { marks: DynamicMark[]; hairpins: Hairpin[] } {
  const marks: DynamicMark[] = [];
  const hairpins: Hairpin[] = [];
  const staff = childNumber(direction, 'staff') ?? 1;
  // Marks for the lower staff printed under it; everything else between the staves.
  const below = staff >= 2 && direction.getAttribute('placement') === 'below';
  const level = soundLevel === null ? {} : { level: soundLevel };

  for (const dynamics of direction.querySelectorAll(':scope > direction-type > dynamics')) {
    const text = [...dynamics.children]
      .map((mark) => (mark.nodeName === 'other-dynamics' ? (mark.textContent?.trim() ?? '') : mark.nodeName))
      .join('');
    if (text) marks.push({ beat, below, text, letters: isDynamicLetters(text), ...level });
  }

  for (const wedge of direction.querySelectorAll(':scope > direction-type > wedge')) {
    const number = wedge.getAttribute('number') ?? '1';
    const type = wedge.getAttribute('type');
    if (type === 'crescendo' || type === 'diminuendo') open.set(number, { start: beat, type, below });
    else if (type === 'stop') {
      const started = open.get(number);
      if (started) hairpins.push({ ...started, end: beat, drawn: true });
      open.delete(number);
    }
  }

  for (const words of direction.querySelectorAll(':scope > direction-type > words')) {
    const text = words.textContent?.trim() ?? '';
    if (dynamicWords(text)) marks.push({ beat, below, text, letters: false, ...level });
  }
  return { marks, hairpins };
}

/** A printed metronome mark: <metronome> with its beat unit (and dot) and the number per minute. */
export function metronomeMark(direction: Element, beat: number): TempoMark | null {
  const metronome = direction.querySelector(':scope > direction-type > metronome');
  if (!metronome) return null;
  const value = NOTE_TYPES[childText(metronome, 'beat-unit') ?? ''];
  // Sometimes "c. 60" or "60-66": the first number is the one to show.
  const perMinute = parseFloat((childText(metronome, 'per-minute') ?? '').replace(/^[^\d]*/, ''));
  if (!value || !(perMinute > 0)) return null;
  const dots = metronome.querySelector(':scope > beat-unit-dot') ? 1 : 0;
  return { beat, unit: { value, dots }, perMinute: Math.round(perMinute) };
}

/**
 * Which pedals are down along the page. The middle (sostenuto) pedal starts with its own type but
 * ends with a plain "stop", so a stop needs to know which pedal it lifts: the one with its number,
 * or else the only one down, or else the one pressed last (like nested brackets).
 */
export interface PedalState {
  sustain: boolean;
  /** A stretch of the right pedal is open on the page: its mark was printed, its release was not yet. */
  sustainPrinted: boolean;
  /** The `number` of a sostenuto pedal that is down ('' when unnumbered), or null. */
  sostenuto: string | null;
  sostenutoLast: boolean;
}

/** A pedal going down or coming up at `beat` along the page. */
type PedalMove = { pedal: PedalKind; beat: number; down: boolean };

/** "yes" / "no", or how far down a pedal is in percent. */
const pedalDown = (value: string) => value === 'yes' || (value !== 'no' && Number(value) >= 50);

/**
 * The pedals a <direction> or <sound> carries: presses and releases for playback, and the printed
 * marks for the staff. Printed marks decide; bare <sound damper-pedal>, <sound sostenuto-pedal>
 * and <sound soft-pedal> only sound.
 */
export function readPedal(
  element: Element,
  sound: Element | null | undefined,
  beat: number,
  state: PedalState,
): { events: PedalMove[]; marks: PedalMark[] } {
  const events: PedalMove[] = [];
  const marks: PedalMark[] = [];
  const pedal = element.querySelector(':scope > direction-type > pedal');
  const type = pedal?.getAttribute('type');
  const number = pedal?.getAttribute('number') ?? '';

  // The middle pedal.
  const byNumber = number !== '' && state.sostenuto !== null && state.sostenuto !== '';
  const liftsSostenuto =
    type === 'stop' &&
    state.sostenuto !== null &&
    (byNumber ? number === state.sostenuto : !state.sustain || state.sostenutoLast);
  if (type === 'sostenuto' || liftsSostenuto) {
    const down = type === 'sostenuto';
    state.sostenuto = down ? number : null;
    state.sostenutoLast = down;
    events.push({ pedal: 'sostenuto', beat, down });
    marks.push({ pedal: 'sostenuto', beat, type: down ? 'start' : 'stop', sign: true, line: true });
  } else if (pedal && (type === 'start' || type === 'stop' || type === 'change')) {
    // The right pedal.
    state.sustain = type !== 'stop';
    state.sustainPrinted = type !== 'stop';
    state.sostenutoLast = false;
    // By the standard, signs ("Ped." and "✱") are the default unless the pedal is drawn with a line.
    const line = pedal.getAttribute('line') === 'yes';
    const sign = pedal.getAttribute('sign') ? pedal.getAttribute('sign') === 'yes' : !line;
    if (type === 'change') events.push({ pedal: 'sustain', beat, down: false });
    events.push({ pedal: 'sustain', beat, down: type !== 'stop' });
    marks.push({ pedal: 'sustain', beat, type, sign, line });
  } else if (pedal && (type === 'resume' || type === 'discontinue')) {
    // A pedal line broken off (at the end of a system) and taken up again: on the tape it runs on.
    state.sustain = type === 'resume';
    if (state.sustain) state.sostenutoLast = false;
    events.push({ pedal: 'sustain', beat, down: state.sustain });
    // But "resume" with nothing to take up is a press: MuseScore 4 writes "Ped." with a line this way.
    if (type === 'resume' && !state.sustainPrinted) {
      state.sustainPrinted = true;
      const line = pedal.getAttribute('line') === 'yes';
      const sign = pedal.getAttribute('sign') ? pedal.getAttribute('sign') === 'yes' : !line;
      marks.push({ pedal: 'sustain', beat, type: 'start', sign, line });
    }
  } else {
    const damper = sound?.getAttribute('damper-pedal');
    if (damper) {
      state.sustain = pedalDown(damper);
      events.push({ pedal: 'sustain', beat, down: state.sustain });
    }
    const sostenuto = sound?.getAttribute('sostenuto-pedal');
    if (sostenuto) {
      const down = pedalDown(sostenuto);
      state.sostenuto = down ? '' : null;
      events.push({ pedal: 'sostenuto', beat, down });
    }
  }

  // The left pedal, in words; a bare <sound soft-pedal> only sounds.
  const words = [...element.querySelectorAll(':scope > direction-type > words')].map((w) => w.textContent?.trim() ?? '');
  const soft = words.find((text) => softPedalWords(text) !== null);
  if (soft) {
    const down = softPedalWords(soft) === 'down';
    events.push({ pedal: 'soft', beat, down });
    marks.push({ pedal: 'soft', beat, type: down ? 'start' : 'stop', sign: false, line: false, text: soft });
  } else {
    const value = sound?.getAttribute('soft-pedal');
    if (value) events.push({ pedal: 'soft', beat, down: pedalDown(value) });
  }
  return { events, marks };
}
