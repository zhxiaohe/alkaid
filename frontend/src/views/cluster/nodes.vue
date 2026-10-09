<template>
	<div>
		<el-alert v-if="!envStore.hasSelected" title="请先在顶部选择环境（集群与环境 1:1 绑定），再查看节点" type="info" :closable="false" show-icon class="m-b-15" />

		<template v-else>
			<div class="flex-between m-b-15">
				<div>
					<el-input v-model="keyword" placeholder="搜索节点名 / IP" style="width: 220px; margin-right: 10px" clearable @keyup.enter="loadList" />
					<el-select v-model="status" placeholder="状态" style="width: 130px; margin-right: 10px" clearable @change="loadList">
						<el-option label="Ready" value="Ready" />
						<el-option label="NotReady" value="NotReady" />
						<el-option label="Unknown（心跳超时）" value="Unknown" />
					</el-select>
					<el-button :icon="Search" @click="loadList">查询</el-button>
				</div>
				<div class="flex align-center">
					<el-switch v-model="autoRefresh" size="small" style="margin-right: 6px" />
					<span class="text-muted" style="font-size: 12px">30s 自动刷新</span>
				</div>
			</div>

			<el-table :data="paginator.list" border stripe v-loading="loading" @row-click="openDetail" style="cursor: pointer">
				<el-table-column prop="name" label="节点名" min-width="170" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="node-name">{{ row.name }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="roles" label="角色" width="120">
					<template #default="{ row }">
						<el-tag v-for="r in (row.roles || '-').split(',')" :key="r" size="small" type="info" class="m-r-5">{{ r }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="状态" width="110" align="center">
					<template #default="{ row }">
						<el-tooltip v-if="row.status === 'Unknown'" content="K8s 侧 Ready，但平台同步心跳超时（>90s）" placement="top">
							<el-tag size="small" type="info" effect="plain">Unknown</el-tag>
						</el-tooltip>
						<el-tag v-else :type="row.status === 'Ready' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="IP / 版本" width="160">
					<template #default="{ row }">
						<div>{{ row.internal_ip || '-' }}</div>
						<div class="text-muted" style="font-size: 12px">{{ row.kubelet_version || '-' }}</div>
					</template>
				</el-table-column>
				<el-table-column label="CPU（分配/可分配）" min-width="180">
					<template #default="{ row }">
						<ResourceBar :used="row.allocated_cpu_milli" :total="row.cpu_allocatable" :text="cpuText(row)" />
					</template>
				</el-table-column>
				<el-table-column label="内存" min-width="180">
					<template #default="{ row }">
						<ResourceBar :used="row.allocated_memory_mi" :total="row.memory_allocatable_mi" :text="memText(row)" />
					</template>
				</el-table-column>
				<el-table-column label="GPU" min-width="170">
					<template #default="{ row }">
						<template v-if="row.gpu_count > 0">
							<el-tag size="small" class="m-r-5">{{ gpuShort(row.gpu_product) }} ×{{ row.gpu_count }}</el-tag>
							<span class="text-muted" style="font-size: 12px">已分配 {{ row.allocated_gpu }}/{{ row.gpu_count }}</span>
						</template>
						<span v-else class="text-muted">非 GPU 节点</span>
					</template>
				</el-table-column>
				<el-table-column label="标签" min-width="180">
					<template #default="{ row }">
						<el-tag v-for="l in topLabels(row)" :key="l" size="small" class="m-r-5 m-b-2" type="warning" effect="plain">{{ l }}</el-tag>
						<el-tooltip v-if="labelCount(row) > 3" :content="restLabels(row).join('，')" placement="top">
							<el-tag size="small" type="info" effect="plain">+{{ labelCount(row) - 3 }}</el-tag>
						</el-tooltip>
					</template>
				</el-table-column>
			<el-table-column label="操作" width="150" fixed="right">
				<template #default="{ row }">
					<el-button size="small" @click.stop="openLabelEditor(row)">打标</el-button>
				</template>
			</el-table-column>
			</el-table>

			<el-pagination
				v-if="paginator.total > paginator.size"
				class="m-t-10"
				background
				layout="total, sizes, prev, pager, next"
				:page-size="paginator.size"
				:current-page="paginator.page"
				:total="paginator.total"
				@size-change="(sz: number) => { paginator.size = sz; paginator.page = 1; loadList() }"
				@current-change="(p: number) => { paginator.page = p; loadList() }"
			/>

			<!-- 节点详情抽屉 -->
			<el-drawer v-model="detailVisible" :title="current?.name" size="560px" destroy-on-close>
				<template v-if="current">
					<h4 class="drawer-sec">基础信息</h4>
					<el-descriptions :column="2" border size="small">
						<el-descriptions-item label="状态">{{ current.status }}</el-descriptions-item>
						<el-descriptions-item label="IP">{{ current.internal_ip || '-' }}</el-descriptions-item>
						<el-descriptions-item label="kubelet">{{ current.kubelet_version || '-' }}</el-descriptions-item>
						<el-descriptions-item label="系统镜像">{{ current.os_image || '-' }}</el-descriptions-item>
						<el-descriptions-item label="Pod（运行/容量）">{{ current.pod_allocated }} / {{ current.pod_capacity }}</el-descriptions-item>
						<el-descriptions-item label="同步心跳">{{ formatTime(current.update_time) }}</el-descriptions-item>
					</el-descriptions>

					<h4 class="drawer-sec">GPU</h4>
					<el-descriptions :column="2" border size="small">
						<el-descriptions-item label="型号">{{ current.gpu_product || '—' }}</el-descriptions-item>
						<el-descriptions-item label="卡数">{{ current.gpu_count || 0 }}</el-descriptions-item>
						<el-descriptions-item label="单卡显存">{{ current.gpu_memory_gi ? current.gpu_memory_gi + ' Gi' : '—' }}</el-descriptions-item>
						<el-descriptions-item label="已分配">{{ current.allocated_gpu }} / {{ current.gpu_count }}</el-descriptions-item>
					</el-descriptions>

					<h4 class="drawer-sec">资源分配（requests / allocatable）</h4>
					<div class="m-b-10">
						<div class="res-row">CPU<ResourceBar :used="current.allocated_cpu_milli" :total="current.cpu_allocatable" :text="cpuText(current)" /></div>
						<div class="res-row">内存<ResourceBar :used="current.allocated_memory_mi" :total="current.memory_allocatable_mi" :text="memText(current)" /></div>
					</div>

					<h4 class="drawer-sec">Labels（{{ labelCount(current) }}）</h4>
					<div class="m-b-10">
						<el-tag v-for="(v, k) in parseLabels(current)" :key="k" size="small" class="m-r-5 m-b-5" type="warning" effect="plain">{{ k }}={{ v }}</el-tag>
					</div>
					<el-button size="small" plain @click="openLabelEditor(current)">编辑标签</el-button>

					<h4 class="drawer-sec">节点上的实例（{{ nodePods.length }}）</h4>
					<el-table :data="nodePods" size="small" border max-height="320">
						<el-table-column prop="name" label="实例" min-width="200" show-overflow-tooltip />
						<el-table-column label="状态" width="100">
							<template #default="{ row }">
								<PhaseTag :phase="row.phase" />
							</template>
						</el-table-column>
						<el-table-column label="GPU" width="70" align="center">
							<template #default="{ row }">{{ row.gpu_request > 0 ? row.gpu_request : '—' }}</template>
						</el-table-column>
						<el-table-column label="CPU" width="90" align="center">
							<template #default="{ row }">{{ row.cpu_request_milli ? row.cpu_request_milli / 1000 + ' 核' : '—' }}</template>
						</el-table-column>
						<el-table-column label="内存" width="90" align="center">
							<template #default="{ row }">{{ row.memory_request_mi ? row.memory_request_mi + ' Mi' : '—' }}</template>
						</el-table-column>
					</el-table>
				</template>
			</el-drawer>

			<!-- 打标编辑弹窗（C3） -->
			<el-dialog v-model="labelEditorVisible" :title="`节点打标 — ${labelTarget?.name || ''}`" width="640px" :close-on-click-modal="false">
				<el-alert type="info" :closable="false" show-icon class="m-b-12" title="提交的是期望的完整标签集：服务端 diff 后下发 K8s，不在列表里的旧标签会被删除；系统标签（k8s.io / GPU 数据源）受保护禁改禁删。" />
				<div v-for="(row, i) in labelRows" :key="i" class="label-row">
					<el-input v-model="row.key" :disabled="row.protected" placeholder="key，如 gpu-pool" style="width: 250px" />
					<span class="label-eq">=</span>
					<el-input v-model="row.value" :disabled="row.protected" placeholder="value，如 prod-a100" style="width: 220px" />
					<el-tooltip v-if="row.protected" content="系统标签受保护" placement="top">
						<el-tag size="small" type="info" effect="plain" style="margin-left: 8px">🔒</el-tag>
					</el-tooltip>
					<el-button v-else size="small" type="danger" plain :icon="Delete" circle style="margin-left: 8px" @click="labelRows.splice(i, 1)" />
				</div>
				<el-button size="small" plain :icon="Plus" @click="labelRows.push({ key: '', value: '', protected: false })">添加标签</el-button>
				<template #footer>
					<el-button @click="labelEditorVisible = false">取消</el-button>
					<el-button type="primary" :loading="labelSaving" @click="saveLabels">下发 K8s</el-button>
				</template>
			</el-dialog>
		</template>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, Plus, Search } from '@element-plus/icons-vue';
import { getClusterNodes, getClusterPods, patchNodeLabels, isProtectedLabel, type ClusterNodeItem, type ClusterPodItem } from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';
import ResourceBar from '/@/components/ResourceBar.vue';
import PhaseTag from '/@/components/PhaseTag.vue';

const envStore = useEnvStore();
const keyword = ref('');
const status = ref('');
const loading = ref(false);
const autoRefresh = ref(true);
const paginator = reactive({ total: 0, list: [] as ClusterNodeItem[], page: 1, size: 20 });

let timer: number | undefined;

const loadList = async () => {
	if (!envStore.hasSelected) return;
	loading.value = true;
	try {
		const res: any = await getClusterNodes({ keyword: keyword.value || undefined, status: status.value || undefined, page: paginator.page, size: paginator.size });
		paginator.total = res?.total ?? 0;
		paginator.list = res?.list ?? [];
	} finally {
		loading.value = false;
	}
};

// ---- 详情抽屉 ----
const detailVisible = ref(false);
const current = ref<ClusterNodeItem | null>(null);
const nodePods = ref<ClusterPodItem[]>([]);

const openDetail = async (row: ClusterNodeItem) => {
	current.value = row;
	detailVisible.value = true;
	const res: any = await getClusterPods({ node_name: row.name, size: 100 });
	nodePods.value = res?.list ?? [];
};

// ---- 打标编辑（C3）----
interface LabelRow {
	key: string;
	value: string;
	protected: boolean;
}
const labelEditorVisible = ref(false);
const labelSaving = ref(false);
const labelTarget = ref<ClusterNodeItem | null>(null);
const labelRows = ref<LabelRow[]>([]);

const openLabelEditor = (row: ClusterNodeItem) => {
	labelTarget.value = row;
	labelRows.value = Object.entries(parseLabels(row)).map(([k, v]) => ({ key: k, value: v, protected: isProtectedLabel(k) }));
	labelEditorVisible.value = true;
};

const saveLabels = async () => {
	if (!labelTarget.value) return;
	// 前端先做一道校验（后端兜底）：key 非空且不重复，受保护行不可删改
	const seen = new Set<string>();
	for (const r of labelRows.value) {
		const k = r.key.trim();
		if (!k) return ElMessage.warning('标签 key 不能为空');
		if (seen.has(k)) return ElMessage.warning(`标签 key 重复：${k}`);
		seen.add(k);
	}
	labelSaving.value = true;
	try {
		const labels: Record<string, string> = {};
		for (const r of labelRows.value) labels[r.key.trim()] = r.value.trim();
		const res: any = await patchNodeLabels(labelTarget.value.name, labels);
		ElMessage.success('标签已下发 K8s，镜像表将在数秒内同步');
		labelEditorVisible.value = false;
		// K8s 返回的最新标签直接更新行数据 + 详情，不等 30s 轮询
		if (res?.labels) {
			const fresh = JSON.stringify(res.labels);
			labelTarget.value.labels = fresh;
			const inList = paginator.list.find((n) => n.name === labelTarget.value?.name);
			if (inList) inList.labels = fresh;
			if (current.value?.name === labelTarget.value.name) current.value.labels = fresh;
		}
		loadList();
	} finally {
		labelSaving.value = false;
	}
};

// ---- 展示辅助 ----
const parseLabels = (n: ClusterNodeItem): Record<string, string> => {
	try {
		return JSON.parse(n.labels || '{}');
	} catch {
		return {};
	}
};
const labelCount = (n: ClusterNodeItem) => Object.keys(parseLabels(n)).length;
const labelPairs = (n: ClusterNodeItem) => Object.entries(parseLabels(n)).map(([k, v]) => `${k}=${v}`);
const topLabels = (n: ClusterNodeItem) => labelPairs(n).slice(0, 3);
const restLabels = (n: ClusterNodeItem) => labelPairs(n).slice(3);
const gpuShort = (p: string) => (p || '').replace(/^nvidia\.com\//, '').replace(/^NVIDIA-?/i, '');
const cpuText = (n: ClusterNodeItem) => `${(n.allocated_cpu_milli / 1000).toFixed(1)}/${(n.cpu_allocatable / 1000).toFixed(1)} 核`;
const memText = (n: ClusterNodeItem) => `${(n.allocated_memory_mi / 1024).toFixed(1)}/${(n.memory_allocatable_mi / 1024).toFixed(1)} Gi`;
const formatTime = (t: string) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-');

onMounted(loadList);
watch(() => envStore.envId, () => {
	paginator.page = 1;
	loadList();
});
watch(autoRefresh, (on) => {
	if (on) timer = window.setInterval(loadList, 30000);
	else window.clearInterval(timer);
});
onMounted(() => {
	if (autoRefresh.value) timer = window.setInterval(loadList, 30000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<style scoped>
.node-name {
	font-weight: 500;
	color: var(--el-color-primary);
}
.drawer-sec {
	margin: 14px 0 8px;
	font-size: 13px;
}
.drawer-sec:first-child {
	margin-top: 0;
}
.res-row {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 8px;
	font-size: 13px;
}
.m-b-2 {
	margin-bottom: 2px;
}
.m-b-12 {
	margin-bottom: 12px;
}
.label-row {
	display: flex;
	align-items: center;
	margin-bottom: 8px;
}
.label-eq {
	margin: 0 6px;
	color: var(--el-text-color-secondary);
}
</style>
