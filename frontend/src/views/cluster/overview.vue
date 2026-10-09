<template>
	<div>
		<el-alert v-if="!envStore.hasSelected" title="请先在顶部选择环境（集群与环境 1:1 绑定），再查看资源总览" type="info" :closable="false" show-icon class="m-b-15" />

		<template v-else>
			<!-- 告警条：只在有异常时渲染，不占正常状态的空间 -->
			<el-alert v-if="alerts.length" type="warning" :closable="false" show-icon class="m-b-15">
				<template #title>
					<span v-for="(a, i) in alerts" :key="i">
						<b>{{ a.strong }}</b>
						<span class="text-muted">{{ a.rest }}</span>
						<span v-if="i < alerts.length - 1" style="margin: 0 10px; color: var(--el-border-color)">·</span>
					</span>
				</template>
			</el-alert>

			<!-- 统计卡 -->
			<div class="stat-grid m-b-15">
				<div class="stat-card">
					<p class="stat-label">节点</p>
					<p class="stat-num">{{ ov.nodes.ready }}<span class="stat-sub"> / {{ ov.nodes.total }}</span></p>
					<p class="stat-foot">Ready / 总数<template v-if="ov.nodes.not_ready + ov.nodes.unknown > 0">（{{ ov.nodes.not_ready }} 异常 · {{ ov.nodes.unknown }} 心跳超时）</template></p>
				</div>
				<div class="stat-card">
					<p class="stat-label">GPU 卡</p>
					<p class="stat-num">{{ ov.gpu.allocated }}<span class="stat-sub"> / {{ ov.gpu.total }}</span></p>
					<p class="stat-foot" :style="gpuPct >= 90 ? 'color: var(--el-color-danger)' : gpuPct >= 70 ? 'color: var(--el-color-warning)' : ''">分配率 {{ gpuPct }}%</p>
				</div>
				<div class="stat-card">
					<p class="stat-label">实例</p>
					<p class="stat-num">{{ ov.pods.by_phase['Running'] ?? 0 }}<span class="stat-sub"> / {{ ov.pods.total }}</span></p>
					<p class="stat-foot">Running<template v-if="pendingCount > 0"> · <span style="color: var(--el-color-warning)">{{ pendingCount }} Pending</span></template></p>
				</div>
				<div class="stat-card">
					<p class="stat-label">CPU / 内存分配率</p>
					<p class="stat-num">{{ cpuPct }}<span class="stat-sub"> % / {{ memPct }} %</span></p>
					<p class="stat-foot">requests / allocatable</p>
				</div>
			</div>

			<!-- 图表 2×2 -->
			<div class="chart-grid">
				<div class="chart-box">
					<p class="chart-title">各节点 GPU 分配率</p>
					<EChart v-if="gpuBarOption" :option="gpuBarOption" height="240px" />
					<el-empty v-else description="无 GPU 节点" :image-size="60" />
				</div>
				<div class="chart-box">
					<p class="chart-title">GPU 卡型分布</p>
					<EChart v-if="gpuPieOption" :option="gpuPieOption" height="240px" />
					<el-empty v-else description="无 GPU 节点" :image-size="60" />
				</div>
				<div class="chart-box">
					<p class="chart-title">实例状态分布</p>
					<EChart v-if="phaseOption" :option="phaseOption" height="240px" />
					<el-empty v-else description="暂无实例" :image-size="60" />
				</div>
				<div class="chart-box">
					<p class="chart-title">CPU / 内存（allocatable 口径）</p>
					<EChart :option="resourceOption" height="240px" />
					<p class="chart-note">利用率曲线为二期 DCGM 接入，接口已留桩</p>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { getClusterNodes, getClusterOverview, type ClusterNodeItem, type ClusterOverview } from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';
import EChart from '/@/components/EChart.vue';

const envStore = useEnvStore();
const autoRefresh = ref(true);
const ov = reactive<ClusterOverview>({
	nodes: { total: 0, ready: 0, not_ready: 0, unknown: 0 },
	cpu: { capacity: 0, allocatable: 0, allocated: 0 },
	memory: { capacity: 0, allocatable: 0, allocated: 0 },
	gpu: { total: 0, allocated: 0, by_product: [] },
	pods: { total: 0, by_phase: {} },
});
const gpuNodes = ref<ClusterNodeItem[]>([]);

let timer: number | undefined;

const loadAll = async () => {
	if (!envStore.hasSelected) return;
	const [o, n] = await Promise.all([getClusterOverview(), getClusterNodes({ size: 100 })]);
	// 拦截器已解包：o 即 overview 结构，n 即 { total, list }
	Object.assign(ov, (o as any) ?? {});
	gpuNodes.value = (((n as any) as any)?.list ?? []) as ClusterNodeItem[];
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const gpuPct = computed(() => pct(ov.gpu.allocated, ov.gpu.total));
const cpuPct = computed(() => pct(ov.cpu.allocated, ov.cpu.allocatable));
const memPct = computed(() => pct(ov.memory.allocated, ov.memory.allocatable));
const pendingCount = computed(() => ov.pods.by_phase['Pending'] ?? 0);

// 告警条内容（为空数组则不渲染）
const alerts = computed(() => {
	const list: { strong: string; rest: string }[] = [];
	if (ov.nodes.not_ready > 0) list.push({ strong: `${ov.nodes.not_ready} 个节点 NotReady`, rest: '' });
	if (ov.nodes.unknown > 0) list.push({ strong: `${ov.nodes.unknown} 个节点同步心跳超时`, rest: '（平台侧链路异常）' });
	if (pendingCount.value > 0) list.push({ strong: `${pendingCount.value} 个实例 Pending`, rest: '等待调度' });
	return list;
});

// 图表公共配色（跟随 Element Plus 主题色系）
const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#9c66e6', '#00b8a9'];

// 1. 各节点 GPU 分配率（横向条形，红黄绿阈值 90/70）
const gpuBarOption = computed(() => {
	const nodes = gpuNodes.value.filter((n) => n.gpu_count > 0);
	if (!nodes.length) return null;
	return {
		colors,
		grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
		xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
		yAxis: { type: 'category', data: nodes.map((n) => n.name), axisLabel: { width: 110, overflow: 'truncate' } },
		tooltip: { trigger: 'axis', valueFormatter: (v: number) => v + '%' },
		series: [
			{
				type: 'bar',
				barWidth: 12,
				data: nodes.map((n) => ({
					value: Math.round((n.allocated_gpu / n.gpu_count) * 100),
					itemStyle: { color: n.allocated_gpu / n.gpu_count >= 0.9 ? '#f56c6c' : n.allocated_gpu / n.gpu_count >= 0.7 ? '#e6a23c' : '#67c23a' },
				})),
				label: { show: true, position: 'right', formatter: '{c}%' },
			},
		],
	};
});

// 2. GPU 卡型分布（环形）
const gpuPieOption = computed(() => {
	if (!ov.gpu.by_product.length) return null;
	return {
		color: colors,
		tooltip: { trigger: 'item', formatter: '{b}<br/>总卡 {c}（占全集群 {d}%）' },
		legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 12 } },
		series: [
			{
				type: 'pie',
				radius: ['42%', '66%'],
				center: ['50%', '44%'],
				itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
				label: { show: true, formatter: '{b}\n{c} 卡' },
				data: ov.gpu.by_product.map((g) => ({ name: g.product, value: g.cards })),
			},
		],
	};
});

// 3. 实例状态分布（环形）
const phaseOption = computed(() => {
	const entries = Object.entries(ov.pods.by_phase).filter(([, v]) => v > 0);
	if (!entries.length) return null;
	const phaseColor: Record<string, string> = { Running: '#67c23a', Pending: '#e6a23c', Succeeded: '#909399', Failed: '#f56c6c', Unknown: '#c0c4cc' };
	return {
		color: colors,
		tooltip: { trigger: 'item', formatter: '{b}: {c}（{d}%）' },
		legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 12 } },
		series: [
			{
				type: 'pie',
				radius: ['42%', '66%'],
				center: ['50%', '44%'],
				itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
				label: { show: true, formatter: '{b} {c}' },
				data: entries.map(([k, v]) => ({ name: k, value: v, itemStyle: { color: phaseColor[k] } })),
			},
		],
	};
});

// 4. CPU / 内存 分配率（横向双条，集群级汇总）
const resourceOption = computed(() => ({
	grid: { left: 8, right: 50, top: 20, bottom: 8, containLabel: true },
	xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
	yAxis: { type: 'category', data: ['内存', 'CPU'] },
	tooltip: { trigger: 'axis', valueFormatter: (v: number) => v + '%' },
	series: [
		{
			type: 'bar',
			barWidth: 16,
			data: [
				{ value: memPct.value, itemStyle: { color: memPct.value >= 90 ? '#f56c6c' : memPct.value >= 70 ? '#e6a23c' : '#67c23a' } },
				{ value: cpuPct.value, itemStyle: { color: cpuPct.value >= 90 ? '#f56c6c' : cpuPct.value >= 70 ? '#e6a23c' : '#67c23a' } },
			],
			label: { show: true, position: 'right', formatter: '{c}%' },
		},
	],
}));

onMounted(() => {
	loadAll();
	if (autoRefresh.value) timer = window.setInterval(loadAll, 30000);
});
watch(() => envStore.envId, loadAll);
watch(autoRefresh, (on) => {
	if (on) timer = window.setInterval(loadAll, 30000);
	else window.clearInterval(timer);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<style scoped>
.stat-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px;
}
.stat-card {
	background: var(--el-fill-color-light);
	border-radius: 8px;
	padding: 14px 16px;
}
.stat-label {
	margin: 0 0 6px;
	font-size: 13px;
	color: var(--el-text-color-secondary);
}
.stat-num {
	margin: 0;
	font-size: 26px;
	font-weight: 500;
}
.stat-sub {
	font-size: 14px;
	color: var(--el-text-color-secondary);
	font-weight: 400;
}
.stat-foot {
	margin: 4px 0 0;
	font-size: 12px;
	color: var(--el-text-color-tertiary);
}
.chart-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}
.chart-box {
	border: 0.5px solid var(--el-border-color-lighter);
	border-radius: 8px;
	padding: 12px 14px;
	background: var(--el-bg-color);
}
.chart-title {
	margin: 0 0 8px;
	font-size: 13px;
	font-weight: 500;
}
.chart-note {
	margin: 6px 0 0;
	font-size: 12px;
	color: var(--el-text-color-tertiary);
}
</style>
