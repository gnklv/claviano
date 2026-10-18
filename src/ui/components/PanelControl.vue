<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue';
import { SMALL_SCREEN, useMediaQuery } from '../composables/useMediaQuery';
import type { IconName } from '../icons/icons';
import AppButton from './AppButton.vue';
import PopOver from './PopOver.vue';
import SheetDialog from './SheetDialog.vue';

/*
 * A button in a bar with what it sets behind it: in a small panel over the button, or in a sheet on
 * a phone. The button says what stands set (`label`, read out; its face in the default slot), the
 * panel is the `panel` slot (given `close`, for a choice that is done with it), and `title` names both.
 */
/** `quiet`: a button that reads as what it says (a readout), not as a control; `icon`: what is behind it, beside the words. */
defineProps<{ title: string; label: string; disabled?: boolean; variant?: 'quiet'; icon?: IconName }>();

const phone = useMediaQuery(SMALL_SCREEN);
const sheet = useTemplateRef<InstanceType<typeof SheetDialog>>('sheet');
const open = ref(false);

function toggle(): void {
  if (phone.value) sheet.value?.open();
  else open.value = !open.value;
}

watch(phone, () => (open.value = false));

function close(): void {
  open.value = false;
  sheet.value?.close();
}
</script>

<template>
  <div class="panel-control">
    <PopOver v-model:open="open" place="above" :label="title">
      <AppButton class="face" :variant="variant" :icon="icon" :label="label" :hint="title" :disabled="disabled" :aria-expanded="phone ? undefined : open" @click="toggle"><slot /></AppButton>
      <template #panel>
        <div class="beside"><slot name="panel" :close="close" /></div>
      </template>
    </PopOver>
    <SheetDialog v-if="phone" ref="sheet" :title="title">
      <slot name="panel" :close="close" />
    </SheetDialog>
  </div>
</template>

<style scoped>
.face {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* (Not "panel": a sheet's own box is called so, and a style of this component reaches the root of a child.) */
.beside {
  box-sizing: border-box;
  width: 300px;
  padding: var(--space-4);
}
</style>
