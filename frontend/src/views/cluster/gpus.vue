<template>
	<div>
		<el-alert v-if="!envStore.hasSelected" title="请先在顶部选择环境（集群与环境 1:1 绑定），再查看显卡" type="info" :closable="false" show-icon class="m-b-15" />

		<template v-else>
			<div class="flex-between m-b-15">
				<span class="text-muted">按卡型聚合（数据来源：节点镜像表 + 实例 GPU requests）</span>
				<div class="flex align-center">
					<el-switch v-model="autoRefresh" size="small" style="margin-right: 6px" />
					<span class="text-muted" style="font-size: 12px">30s 自动刷新</span>
				</div>
			</div>

			<el-empty v-if="!loading && !groups.length" description="当前环境没有 GPU 节点" />

			<!-- 每个卡型一张聚合行卡片 -->
			<div v-for="g in groups" :key="g.product" class="gpu-card">
				<div class="gpu-head" @click="toggle(g.product)">
					<div class="gpu-name">
						{{ g.product }}
						<div class="text-muted" style="font-size: 12px; font-weight: 400">{{ g.memory_gi ? g.memory_gi + ' Gi 显存 · ' : '' }}{{ g.node_count }} 个节点</div>
					</div>
					<div class="gpu-stats">
						<div class="gstat">
							<p class="glabel">总卡数</p>
							<p class="gnum">{{ g.cards }}</p>
						</div>
						<div class="gstat">
							<p class="glabel">已分配</p>
							<p class="gnum" :style="allocColor(g)">{{ g.allocated }} <span class="gpct">({{ pct(g) }}%)</span></p>
						</div>
						<div class="gstat">
							<p class="glabel">空闲</p>
							<p class="gnum">{{ g.cards - g.allocated }}</p>
						</div>
					</div>
					<div style="width: 180px">
						<ResourceBar :used="g.allocated" :total="g.cards" />
					</div>
					<el-icon :class="['arrow', expanded === g.product ? 'is-open' : '']"><ArrowDown /></el-icon>
				</div>

				<!-- 下钻：该卡型所在节点 → 节点上占用 GPU 的 Pod -->
				<template v-if="expanded === g.product">
					<div v-for="nd in g.nodes" :key="nd.name" class="drill">
						<div class="drill-head">
							<span class="node-name">{{ nd.name }}</span>
							<span class="text-muted" style="font-size: 12px">本节点 {{ nd.count }} 卡 · 已分配 {{ nd.allocated }}</span>
						</div>
						<el-table v-if="nd.pods.length" :data="nd.pods" size="small" border max-height="260">
							<el-table-column prop="namespace" label="namespace" width="130" show-overflow-tooltip />
							<el-table-column prop="name" label="实例" min-width="230" show-overflow-tooltip />
							<el-table-column label="归属服务" min-width="130">
								<template #default="{ row }">
									<el-link v-if="row.service_ref" type="primary" @click="gotoService(row.service_ref)">{{ row.service_ref }}</el-link>
									<span v-else class="text-muted">-</span>
								</template>
							</el-table-column>
							<el-table-column label="状态" width="100" align="center">
								<template #default="{ row }"><PhaseTag :phase="row.phase" /></template>
							</el-table-column>
							<el-table-column label="申请 GPU" width="90" align="center">
								<template #default="{ row }">{{ row.gpu_request }}</template>
							</el-table-column>
						</el-table>
						<el-empty v-else description="该节点 GPU 全部空闲" :image-size="48" />
					</div>
				</template>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { getClusterNodes, getClusterPods, type ClusterNodeItem, type ClusterPodItem } from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';
import ResourceBar from '/@/components/ResourceBar.vue';
import PhaseTag from '/@/components/PhaseTag.vue';

interface GpuPod extends ClusterPodItem {}
interface NodeDrill {
	name: string;
	count: number;
	allocated: number;
	pods: GpuPod[];
}
interface GpuGroup {
	product: string;
	memory_gi: number;
	cards: number;
	allocated: number;
	node_count: number;
	nodes: NodeDrill[];
}

const router = useRouter();
const envStore = useEnvStore();
const loading = ref(false);
const autoRefresh = ref(true);
const groups = ref<GpuGroup[]>([]);
const expanded = ref('');

let timer: number | undefined;

// 前端聚合：nodes 按 gpu_product 分组 → 组内再按节点拆 → 每节点拉占用 GPU 的 Pod
// （节点/实例量级小，直接前端聚合，免后端加接口；量大再下沉）
const loadAll = async () => {
	if (!envStore.hasSelected) return;
	loading.value = true;
	try {
		const [nodesRes, podsRes] = await Promise.all([getClusterNodes({ has_gpu: '1', size: 100 }), getClusterPods({ size: 500 })]);
		const nodes = ((nodesRes as any)?.list ?? []) as ClusterNodeItem[];
		const allPods = ((podsRes as any)?.list ?? []) as ClusterPodItem[];
		const gpuPodsByNode = new Map<string, ClusterPodItem[]>();
		for (const p of allPods) {
			if (p.gpu_request > 0 && p.node_name) {
				if (!gpuPodsByNode.has(p.node_name)) gpuPodsByNode.set(p.node_name, []);
				gpuPodsByNode.get(p.node_name)!.push(p);
			}
		}
		const map = new Map<string, GpuGroup>();
		for (const n of nodes) {
			let g = map.get(n.gpu_product);
			if (!g) {
				g = { product: n.gpu_product, memory_gi: n.gpu_memory_gi, cards: 0, allocated: 0, node_count: 0, nodes: [] };
				map.set(n.gpu_product, g);
			}
			g.cards += n.gpu_count;
			g.allocated += n.allocated_gpu;
			g.node_count++;
			g.nodes.push({
				name: n.name,
				count: n.gpu_count,
				allocated: n.allocated_gpu,
				pods: gpuPodsByNode.get(n.name) ?? [],
			});
		}
		groups.value = [...map.values()].sort((a, b) => b.cards - a.cards);
	} finally {
		loading.value = false;
	}
};

const toggle = (product: string) => (expanded.value = expanded.value === product ? '' : product);
const pct = (g: GpuGroup) => (g.cards > 0 ? Math.round((g.allocated / g.cards) * 100) : 0);
const allocColor = (g: GpuGroup) => {
	const p = pct(g);
	if (p >= 90) return 'color: var(--el-color-danger)';
	if (p >= 70) return 'color: var(--el-color-warning)';
	return '';
};
const gotoService = (name: string) => router.push({ name: 'inferenceDetail', params: { name } });

onMounted(() => {
	loadAll();
	if (autoRefresh.value) timer = window.setInterval(loadAll, 30000);
});
watch(() => envStore.envId, () => {
	expanded.value = '';
	loadAll();
});
watch(autoRefresh, (on) => {
	if (on) timer = window.setInterval(loadAll, 30000);
	else window.clearInterval(timer);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<style scoped>
.gpu-card {
	border: 0.5px solid var(--el-border-color-lighter);
	border-radius: 10px;
	margin-bottom: 12px;
	overflow: hidden;
}
.gpu-head {
	display: flex;
	align-items: center;
	gap: 18px;
	padding: 14px 18px;
	cursor: pointer;
}
.gpu-head:hover {
	background: var(--el-fill-color-lighter);
}
.gpu-name {
	width: 220px;
	font-weight: 500;
	flex-shrink: 0;
}
.gpu-stats {
	display: flex;
	gap: 32px;
	flex: 1;
}
.gstat {
	min-width: 70px;
}
.glabel {
	margin: 0 0 2px;
	font-size: 12px;
	color: var(--el-text-color-secondary);
}
.gnum {
	margin: 0;
	font-size: 20px;
	font-weight: 500;
}
.gpct {
	font-size: 12px;
	font-weight: 400;
	color: var(--el-text-color-secondary);
}
.arrow {
	color: var(--el-text-color-secondary);
	transition: transform 0.2s;
}
.arrow.is-open {
	transform: rotate(180deg);
}
.drill {
	border-top: 0.5px dashed var(--el-border-color-lighter);
	padding: 12px 18px 14px;
	background: var(--el-fill-color-lighter);
}
.drill-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}
.node-name {
	font-weight: 500;
	color: var(--el-color-primary);
	font-size: 13px;
}
</style>
