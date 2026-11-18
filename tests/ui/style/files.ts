import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function filesIn(folder: string, matches: (name: string) => boolean): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return filesIn(path, matches);
    return matches(name) ? [path] : [];
  });
}

export const styleFilesIn = (folder: string): string[] =>
  filesIn(folder, (name) => /\.(vue|css)$/.test(name));

export const componentFilesIn = (folder: string): string[] =>
  filesIn(folder, (name) => name.endsWith('.vue'));
