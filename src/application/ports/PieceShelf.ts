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
}
