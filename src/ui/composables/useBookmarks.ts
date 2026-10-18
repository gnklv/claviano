import type { Bookmark, Bookmarks } from '../../application/use-cases/Bookmarks';
import { useMirror } from './useMirror';

/** The open piece's bookmarks, mirrored. */
export const useBookmarks = (bookmarks: Bookmarks) => useMirror(bookmarks, (): readonly Bookmark[] => bookmarks.all);
