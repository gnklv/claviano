/** A piece kept on the shelf: what is known of it without opening its file. */
export interface ShelvedPiece {
  /** Tells the piece from any other: the same file is the same piece (see contentId). */
  readonly id: string;
  /** The file's name as it was given: its extension tells the format. */
  readonly fileName: string;
  readonly title: string;
  /** When it was last opened, in milliseconds since 1970. */
  readonly openedAt: number;
}

/** How a piece was left: what it takes to come back to it where one stopped. */
export interface PieceMemory {
  /** The place, in seconds into the piece. */
  readonly position: number;
  /** The tempo, as a share of the piece's own. */
  readonly tempo: number;
  readonly hands: { readonly right: boolean; readonly left: boolean };
  /** The bar loop: printed bar numbers, and whether it was on. */
  readonly loop: { readonly on: boolean; readonly from: number; readonly to: number };
  /** The tempo trainer: whether it was on, and how it goes (tempos as shares). Not in what older versions kept, nor its steps back. */
  readonly trainer?: { readonly on: boolean; readonly from: number; readonly to: number; readonly step: number; readonly every: number; readonly back?: boolean };
  /** Bookmarks: a name and a printed bar each. Not in what older versions kept. */
  readonly bookmarks?: readonly { readonly name: string; readonly bar: number }[];
  /** One's own fingers: a finger at a note of the page (its beat and its pitch). Not in what older versions kept. */
  readonly fingers?: readonly { readonly beat: number; readonly pitch: number; readonly finger: 1 | 2 | 3 | 4 | 5 }[];
  /** For the shelf to say without opening the piece: the bar it was left at, and its last bar (as numbered on the page). */
  readonly bar: number;
  readonly bars: number;
}

/**
 * Where opened pieces are kept between visits: the files as they were given, and what is known of
 * each. Any of this may fail (no storage in a private window, no room): callers go on without it.
 */
export interface PieceShelf {
  list(): Promise<ShelvedPiece[]>;
  /** A piece's file; null when the shelf has no such piece. */
  file(id: string): Promise<ArrayBuffer | null>;
  /** Puts a piece on the shelf, or writes anew what is known of one; `data` is its file, given when it is new. */
  save(piece: ShelvedPiece, data?: ArrayBuffer): Promise<void>;
  /**
   * Asks that the shelf be kept for good: a browser short of room clears what sites have stored,
   * unless it was asked not to (and agreed). Nothing comes of it either way: it is only asked.
   */
  protect(): Promise<void>;
  /** Takes a piece off the shelf, with its file and what was remembered of it. */
  remove(id: string): Promise<void>;
  /** How each piece was left, by its id (a demo's too, which is not on the shelf). What is read is whatever was stored: to be checked. */
  memories(): Promise<Record<string, unknown>>;
  remember(id: string, memory: PieceMemory): Promise<void>;
}
