<template>
	<div ref="el" class="echart" :style="{ height }" />
</template>

<script setup lang="ts">
// EChart：echarts 按需引入封装
// - 传 option 即渲染，option 变更自动 setOption（notMerge 换图型时也可）
// - 容器尺寸变化自动 resize，组件卸载 dispose
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, PieChart, GaugeChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([BarChart, PieChart, GaugeChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = withDefaults(
	defineProps<{
		option: EChartsCoreOption;
		height?: string;
		notMerge?: boolean;
	}>(),
	{ height: '260px', notMerge: false }
);

const el = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

onMounted(() => {
	if (!el.value) return;
	chart = echarts.init(el.value);
	chart.setOption(props.option, props.notMerge);
	ro = new ResizeObserver(() => chart?.resize());
	ro.observe(el.value);
});

watch(
	() => props.option,
	(opt) => chart?.setOption(opt, props.notMerge),
	{ deep: true }
);

onBeforeUnmount(() => {
	ro?.disconnect();
	chart?.dispose();
	chart = null;
});
</script>

<style scoped>
.echart {
	width: 100%;
}
</style>
