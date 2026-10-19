<script setup lang="ts">
import type { NoteValue } from '../../domain/notation/noteValue';
import type { TempoReading } from './tempoReading';

/*
 * A tempo written as in the music (a quarter = 90): the note is of the music font, the same that draws it
 * on the staff, not a character of whichever font a system has.
 *
 * (The codes are SMuFL's, as infrastructure/render/staff/glyphs.ts has them for the staff: the
 * interface does not reach into the renderer for them.)
 */
const NOTES: Record<NoteValue, string> = {
  whole: '',
  half: '',
  quarter: '',
  eighth: '',
  sixteenth: '',
  thirtySecond: '',
};
const DOT = '';

defineProps<TempoReading>();
</script>

<template>
  <span class="tempo-mark"
    ><span class="note" aria-hidden="true">{{ NOTES[unit] }}{{ dotted ? DOT : '' }}</span> = {{ perMinute }}</span
  >
</template>

<style scoped>
.tempo-mark {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* (The music font is drawn for a staff: at the size of the words its note stands as tall as a capital.) */
.note {
  font-family: 'Bravura';
  font-size: 1.15em;
  /* (It takes no height of its own: the line is as tall as its words, whatever the note's stem.) */
  line-height: 0;
  /* (Its own width ends at the head: a little air before the sign after it.) */
  margin-right: 0.15em;
}
</style>
