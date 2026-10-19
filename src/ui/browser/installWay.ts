/** How the app can be installed here: by asking the browser, by hand on an iPhone, not at all; or it is installed already. */
export type InstallWay = 'prompt' | 'ios' | 'none' | 'installed';

export function installWay(here: { standalone: boolean; canPrompt: boolean; userAgent: string; touchPoints: number }): InstallWay {
  if (here.standalone) return 'installed';
  if (here.canPrompt) return 'prompt';
  // (An iPad says it is a Mac; a Mac has no touch screen.)
  const ios = /iPhone|iPad|iPod/.test(here.userAgent) || (/Macintosh/.test(here.userAgent) && here.touchPoints > 1);
  return ios ? 'ios' : 'none';
}
