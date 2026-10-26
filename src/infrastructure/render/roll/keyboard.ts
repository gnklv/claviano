import type { Hand } from '../../../domain/note';
import { isBlackKey } from '../../../domain/pitch';
import type { Score } from '../../../domain/score';
import { MAX_WHITE_KEY_PX, keyboardRange, whiteKeyCount, type KeyRange } from '../keyboardRange';
import type { RollPen } from './ink';

/* The keyboard under the falling notes: which keys, how wide and how long, and how it is drawn. */

/** A key across the keyboard: where it begins and how wide it is (pixels). */
export interface KeyRect {
  readonly x: number;
  readonly width: number;
  readonly black: boolean;
}

/*
 * Keyboard proportions. A white key looks right when it is about four times as long as it is wide
 * and turns into a square below ~2.5. The keyboard takes at most this share of the canvas height;
 * when that is too short, more octaves are shown so the keys get narrower instead of squarer.
 */
const KEY_LENGTH_RATIO = 4;
const MIN_KEY_LENGTH_RATIO = 2.5;
const MAX_KEYBOARD_SHARE = 0.45;
export const MIN_KEYBOARD_PX = 40;
/**
 * No taller, however much height there is: the keys say where a note falls, the room above them
 * is for what falls. By eye on "Ode to Joy" and the showcase at 1280×800 (140 left the falling
 * notes short of room over a keyboard of few octaves).
 */
const MAX_KEYBOARD_PX = 110;
/*
 * Scrolling. When the piece's range would make white keys narrower than SCROLL_BELOW_PX,
 * keys get SCROLL_KEY_PX instead and the keyboard becomes wider than the screen.
 */
const SCROLL_BELOW_PX = 16;
const SCROLL_KEY_PX = 20;
/*
 * A black key beside a white one: as wide and as long as these shares of it (a piano's are near
 * 13.5 of 23.5 mm across, and 95 of 150 mm long).
 */
const BLACK_KEY = { width: 0.6, length: 0.62 };
/** Every Do's name on its key: a size between these, after the width of the screen, so far up from the key's end (pixels). */
const DO_LABEL = { smallest: 7, largest: 11, perWidth: 110, above: 4 };

export interface KeyboardLayout {
  readonly keys: ReadonlyMap<number, KeyRect>;
  /** A white key's width. */
  readonly keyWidth: number;
  /** Width of the whole keyboard; more than the canvas's when it scrolls. */
  readonly contentWidth: number;
  readonly height: number;
}

/** The keyboard's range and height, picked together so that the keys keep a piano's proportions. */
export function layoutKeyboard(score: Score, width: number, height: number): KeyboardLayout {
  const tallest = Math.max(MIN_KEYBOARD_PX, Math.min(MAX_KEYBOARD_PX, height * MAX_KEYBOARD_SHARE));
  const maxKeyWidth = Math.min(MAX_WHITE_KEY_PX, tallest / MIN_KEY_LENGTH_RATIO);
  const range = keyboardRange(score, width, maxKeyWidth);
  const whiteKeys = whiteKeyCount(range);
  const fitWidth = width / whiteKeys;
  const keyWidth = fitWidth >= SCROLL_BELOW_PX ? fitWidth : Math.min(SCROLL_KEY_PX, maxKeyWidth);
  return {
    keys: layoutKeys(keyWidth, range),
    keyWidth,
    contentWidth: whiteKeys * keyWidth,
    height: Math.min(tallest, Math.max(MIN_KEYBOARD_PX, keyWidth * KEY_LENGTH_RATIO)),
  };
}

function layoutKeys(whiteWidth: number, range: KeyRange): Map<number, KeyRect> {
  const blackWidth = whiteWidth * BLACK_KEY.width;
  const keys = new Map<number, KeyRect>();
  let whiteIndex = 0;
  for (let pitch = range.low; pitch <= range.high; pitch++) {
    if (isBlackKey(pitch)) {
      keys.set(pitch, { x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black: true });
    } else {
      keys.set(pitch, { x: whiteIndex * whiteWidth, width: whiteWidth, black: false });
      whiteIndex++;
    }
  }
  return keys;
}

/**
 * The keys, from `top` and `height` tall: those in `active` pressed, in the colour of their hand.
 * Every Do is named, a landmark for finding one's place (`viewWidth`: the screen's, for the size);
 * on a pressed key, in the ink that reads on its hand's colour.
 */
export function drawKeyboard(
  { ctx, colors }: RollPen,
  keys: ReadonlyMap<number, KeyRect>,
  top: number,
  height: number,
  active: Map<number, Hand>,
  noteLabel: (midi: number) => string,
  viewWidth: number,
): void {
  const blackHeight = height * BLACK_KEY.length;
  for (const black of [false, true]) {
    for (const [pitch, key] of keys) {
      if (key.black !== black) continue;
      const hand = active.get(pitch);
      ctx.fillStyle = hand ? colors.hand[hand] : black ? colors.blackKey : colors.whiteKey;
      const keyHeight = black ? blackHeight : height;
      ctx.fillRect(key.x, top, key.width, keyHeight);
      if (!black) {
        ctx.strokeStyle = colors.keyBorder;
        ctx.strokeRect(key.x + 0.5, top + 0.5, key.width - 1, keyHeight - 1);
      }
    }
  }

  const fontSize = Math.max(DO_LABEL.smallest, Math.min(DO_LABEL.largest, viewWidth / DO_LABEL.perWidth));
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const [midi, key] of keys) {
    if (midi % 12 !== 0) continue;
    ctx.fillStyle = active.has(midi) ? colors.onHand : colors.keyLabel;
    ctx.fillText(noteLabel(midi), key.x + key.width / 2, top + height - DO_LABEL.above);
  }
  ctx.textAlign = 'start';
}
