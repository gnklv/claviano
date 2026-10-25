<script setup lang="ts">
import PlanPanel from './PlanPanel.vue';
import SheetDialog from '../components/SheetDialog.vue';
import { useTemplateRef } from 'vue';
import { useI18n } from '../i18n/useI18n';

/*
 * The list of every step of the plan, in a sheet, opened where one is in it. A step begun from it
 * closes it, and is told (`began`): what opened it may have more to close.
 */
const emit = defineEmits<{ began: [] }>();

const { t } = useI18n();
const sheet = useTemplateRef<InstanceType<typeof SheetDialog>>('sheet');
const list = useTemplateRef<InstanceType<typeof PlanPanel>>('list');

defineExpose({
  open: () => {
    sheet.value?.open();
    list.value?.showWhereOneIs();
  },
});

function began(): void {
  sheet.value?.close();
  emit('began');
}
</script>

<template>
  <SheetDialog ref="sheet" :title="t('plan')">
    <PlanPanel ref="list" @done="began" />
  </SheetDialog>
</template>
