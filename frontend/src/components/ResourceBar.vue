<template>
	<div class="res-bar">
		<div class="track">
			<div class="fill" :style="{ width: pct + '%', background: color }" />
		</div>
		<span class="txt" :style="{ color: over90 ? 'var(--el-color-danger)' : '' }">{{ display }}</span>
	</div>
</template>

<script setup lang="ts">
// ResourceBar：资源分配率进度条（已分配/可分配 或 已分配/总量）
// 阈值：<70% 绿 / <90% 黄 / >=90% 红
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		used: number; // 已分配
		total: number; // 总量（0 时显示 —）
		text?: string; // 右侧说明文字（如 "11.6/15.2 核"），缺省显示百分比
	}>(),
	{}
);

const pct = computed(() => (props.total > 0 ? Math.min(100, (props.used / props.total) * 100) : 0));
const over70 = computed(() => pct.value >= 70);
const over90 = computed(() => pct.value >= 90);
const color = computed(() => (over90.value ? 'var(--el-color-danger)' : over70.value ? 'var(--el-color-warning)' : 'var(--el-color-success)'));
const display = computed(() => props.text || (props.total > 0 ? pct.value.toFixed(0) + '%' : '—'));
</script>

<style scoped>
.res-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}
.track {
	width: 72px;
	height: 6px;
	border-radius: 3px;
	background: var(--el-fill-color-light);
	overflow: hidden;
	flex-shrink: 0;
}
.fill {
	height: 100%;
	border-radius: 3px;
	transition: width 0.3s;
}
.txt {
	font-size: 12px;
	color: var(--el-text-color-secondary);
	white-space: nowrap;
}
</style>
