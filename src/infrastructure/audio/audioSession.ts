/*
 * An iPhone's ringer switch, set to silent, also silences Web Audio: to the phone a page's sounds
 * are of the kind that keep quiet with the ringer off (clicks, alerts) unless the page says
 * otherwise. This says it: what plays here is music, to be heard as a player app's would be.
 *
 * (The Audio Session API: Safari 16.4 and later. Other browsers have no such switch to answer to.)
 */
interface AudioSession {
  type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
}

interface WithAudioSession {
  audioSession?: AudioSession;
}

export function playAsMusic(host: WithAudioSession = navigator as WithAudioSession): void {
  if (host.audioSession) host.audioSession.type = 'playback';
}
