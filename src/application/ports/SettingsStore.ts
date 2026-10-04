/** Somewhere the user's choices are kept between visits. */
export interface SettingsStore {
  /** What was saved last; null when there is nothing, or it cannot be read. */
  load(): unknown;
  /** Keeps `settings` (plain data) for the next visit. Not being able to is no error. */
  save(settings: unknown): void;
}
