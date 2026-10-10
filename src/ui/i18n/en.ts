/** A plain text, or forms for different counts (chosen by Intl.PluralRules). */
export type Message = string | PluralMessage;

export interface PluralMessage extends Partial<Record<Intl.LDMLPluralRule, string>> {
  readonly other: string;
}

/** The English dictionary defines the set of keys; every other language must provide all of them. */
export const en = {
  appTitle: 'Claviano',
  settings: 'Settings',
  viewMode: 'View',
  viewStaff: 'Notes',
  viewKeys: 'Keys',
  viewBoth: 'Both',
  theme: 'Theme',
  themeAuto: 'Auto (as in the system)',
  themeLight: 'Light',
  themeDark: 'Dark',
  language: 'Language',
  creditPiano: 'Piano sound',
  creditPianoChanges: 'shortened and compressed',
  sound: 'Sound',
  soundPiano: 'Piano',
  soundSynth: 'Synth',
  pedal: 'Pedal',
  on: 'On',
  off: 'Off',
  countIn: 'Count-in',
  instrumentLoading: 'Piano sound is loading…',
  instrumentUnavailable: 'Piano sound did not load: a simple synth plays',
  metronome: 'Metronome',
  metronomeHint: 'A click on every beat',
  pedalPress: 'Pedal ↓',
  pedalRelease: 'Pedal ↑',
  pedalChange: 'Pedal ↑↓',
  softPedalPress: 'Left pedal ↓',
  softPedalRelease: 'Left pedal ↑',
  softPedalChange: 'Left pedal ↑↓',
  sostenutoPedalPress: 'Middle pedal ↓',
  sostenutoPedalRelease: 'Middle pedal ↑',
  sostenutoPedalChange: 'Middle pedal ↑↓',

  openMidi: 'Open file',
  demo: 'Demo',
  demoOde: 'Ode to Joy',
  demoShowcase: 'Showcase: everything the player can do',
  openFormats: 'MIDI, MusicXML, MXL',
  libraryHint: 'Or drop a file onto the window',
  backToLibrary: 'Back to the library',
  dropHint: 'Release to open',
  scoreSummary: '{title} · {bars} · {notes}',
  barsCount: { one: '{count} bar', other: '{count} bars' },
  notesCount: { one: '{count} note', other: '{count} notes' },

  play: 'Play',
  pause: 'Pause',
  playHint: 'Space',
  stop: 'Back to start',
  barPosition: 'Bar {current} / {total}',
  barPositionEmpty: 'Bar –',
  tempo: 'Tempo',
  rightHand: 'Right',
  leftHand: 'Left',
  handMarkRight: 'R.H.',
  handMarkLeft: 'L.H.',
  loop: 'Loop',
  loopFrom: 'From bar',
  loopTo: 'To bar',
  loopBars: 'Loop bars',

  openError: 'Could not open “{file}”: {reason}',
  errorUnsupportedFormat: 'this file type is not supported, choose MIDI (.mid) or MusicXML (.musicxml, .mxl)',
  errorInvalidFile: 'the file is damaged or is not MIDI / MusicXML',
  errorUnsupportedFeature: 'this kind of file is not supported yet',
  errorUnknown: 'unexpected error',
} satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;
export type Dictionary = Record<MessageKey, Message>;
