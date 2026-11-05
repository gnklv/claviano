<script setup lang="ts">
defineProps<{ rows: readonly { title: string; detail: string }[]; current?: number | null; label: string }>();
</script>

<template>
  <ol class="sequence" :aria-label="label">
    <li v-for="(row, index) in rows" :key="index" :aria-current="index === current ? 'step' : undefined">
      <strong>{{ row.title }}</strong>
      <p>{{ row.detail }}</p>
    </li>
  </ol>
</template>

<style scoped>
.sequence { margin: 0; padding-left: var(--space-5); }
li { padding: var(--space-3); border-bottom: var(--edge) solid var(--border); }
li[aria-current] { background: var(--control); border-radius: var(--radius-s); }
strong { font-weight: var(--title-weight); }
p { margin: var(--space-1) 0 0; color: var(--muted); font-size: var(--text-s); line-height: 1.5; }
</style>
