<script setup lang="ts">
/* The name of a section of a screen, over what is in it: small, quiet, set apart from what is over it. */
</script>

<template>
  <h2 class="section-heading"><slot /></h2>
</template>

<style scoped>
.section-heading {
  margin: var(--space-6) 0 var(--space-3);
  color: var(--muted);
  font-size: var(--text-s);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.section-heading:first-child {
  margin-top: 0;
}
</style>
