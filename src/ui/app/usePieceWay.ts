import type { PieceWay, Way } from '../../application/use-cases/PieceWay';
import { useMirror } from './useMirror';

/** The open piece's way, mirrored: listened to, or learnt. */
export const usePieceWay = (way: PieceWay) => useMirror(way, (): Way => way.way);
