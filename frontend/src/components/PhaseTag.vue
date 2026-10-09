<template>
	<el-tag :type="map[phase]?.type ?? 'info'" size="small" effect="light">{{ map[phase]?.label ?? phase }}</el-tag>
</template>

<script setup lang="ts">
// PhaseTag：Pod phase 统一色彩映射
defineProps<{ phase: string }>();

const map: Record<string, { type: 'success' | 'warning' | 'danger' | 'info' | 'primary'; label: string }> = {
	Running: { type: 'success', label: 'Running' },
	Pending: { type: 'warning', label: 'Pending' },
	Failed: { type: 'danger', label: 'Failed' },
	Succeeded: { type: 'info', label: 'Succeeded' },
	Unknown: { type: 'info', label: 'Unknown' },
};
</script>
