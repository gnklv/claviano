/*
 * The icons: one set, drawn here, in one manner. Each is drawn on a square of 24 units with a line
 * 1.75 wide, its ends and corners round; what must read at a glance in a bar of controls (play,
 * pause, stop, record) is solid instead. An icon takes the colour of the words around it.
 *
 * They are not characters of a font: those are drawn by whichever font a system has, each of its
 * own weight and size, and an iPhone draws some of them as emoji.
 */

/** A part of an icon: the path of a line, or of a solid shape. */
export interface IconPart {
  d: string;
  solid?: boolean;
}

/** A circle as a path, so that every part of an icon is one kind of thing. */
const circle = (x: number, y: number, r: number): string => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

const line = (d: string): IconPart => ({ d });
const solid = (d: string): IconPart => ({ d, solid: true });

export const ICONS = {
  back: [line('M19 12H5M11 6l-6 6 6 6')],
  // A step along the keyboard: lower, higher.
  lower: [line('M14.5 6l-6 6 6 6')],
  higher: [line('M9.5 6l6 6-6 6')],
  close: [line('M6 6l12 12M18 6L6 18')],
  // A tick, as a teacher puts by what was played right: done.
  check: [line('M5 12.5l4.5 4.5L19 7')],
  // Two sliders, not a cog: what the settings hold is levels and choices. (Two, not three: a third leaves no air at a small size.)
  settings: [line(`M4 8h8M18 8h2M4 16h2M12 16h8${circle(15, 8, 3)}${circle(9, 16, 3)}`)],
  play: [solid('M8 5.5v13l11-6.5z')],
  pause: [solid('M7 6h3v12H7zM14 6h3v12h-3z')],
  stop: [solid('M7 7h10v10H7z')],
  record: [solid(circle(12, 12, 6))],
  loop: [line('M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4')],
  more: [solid(circle(5.5, 12, 0.75) + circle(12, 12, 0.75) + circle(18.5, 12, 0.75))],
  plus: [line('M12 5v14M5 12h14')],
  minus: [line('M5 12h14')],
  // An eighth note: a head, a stem, a flag.
  note: [solid('M5.6 18.3a2.9 2.2 -20 1 0 5.4 -2a2.9 2.2 -20 1 0 -5.4 2z'), line('M11.25 16.6V4.5c.7 3 5.25 3.6 5.25 7.6')],
  sun: [line(`${circle(12, 12, 4)}M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4`)],
  moon: [line('M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z')],
  // The system's own choice: half a day, half a night.
  auto: [line(circle(12, 12, 8)), solid('M12 4a8 8 0 0 1 0 16z')],
  metronome: [line('M9.5 4h5L19 20H5zM12 16l5-9.5')],
  // A ribbon, as is kept between the pages of a book: a place to come back to.
  bookmark: [line('M7 4h10v16l-5-3.5L7 20z')],
  // A pencil, for writing in what the notes do not say: one's own fingers.
  pencil: [line('M15.5 5.5l3 3M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z')],
} satisfies Record<string, IconPart[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
