import { describe, expect, it } from 'vitest';
import { playAsMusic } from '../src/infrastructure/audio/audioSession';

describe('playAsMusic', () => {
  it('tells a phone that has an audio session that music plays here', () => {
    const host = { audioSession: { type: 'auto' as const } };
    playAsMusic(host);
    expect(host.audioSession.type).toBe('playback');
  });

  it('does nothing in a browser without one', () => {
    expect(() => playAsMusic({})).not.toThrow();
  });
});
