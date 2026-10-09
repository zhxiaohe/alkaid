<template>
	<div>
		<el-alert v-if="!envStore.hasSelected" title="请先在顶部选择环境（集群与环境 1:1 绑定），再查看服务实例" type="info" :closable="false" show-icon class="m-b-15" />

		<template v-else>
			<div class="flex-between m-b-15">
				<div>
					<el-input v-model="keyword" placeholder="搜索实例名 / 归属服务" style="width: 220px; margin-right: 10px" clearable @keyup.enter="loadList" />
					<el-select v-model="namespace" placeholder="namespace" style="width: 150px; margin-right: 10px" clearable filterable @change="loadList">
						<el-option v-for="ns in nsOptions" :key="ns" :label="ns" :value="ns" />
					</el-select>
					<el-select v-model="phase" placeholder="状态" style="width: 120px; margin-right: 10px" clearable @change="loadList">
						<el-option label="Running" value="Running" />
						<el-option label="Pending" value="Pending" />
						<el-option label="Succeeded" value="Succeeded" />
						<el-option label="Failed" value="Failed" />
						<el-option label="Unknown" value="Unknown" />
					</el-select>
					<el-select v-model="nodeName" placeholder="节点" style="width: 170px; margin-right: 10px" clearable filterable @change="loadList">
						<el-option v-for="n in nodeOptions" :key="n" :label="n" :value="n" />
					</el-select>
					<el-button :icon="Search" @click="loadList">查询</el-button>
				</div>
				<div class="flex align-center">
					<el-switch v-model="autoRefresh" size="small" style="margin-right: 6px" />
					<span class="text-muted" style="font-size: 12px">30s 自动刷新</span>
				</div>
			</div>

			<el-table :data="paginator.list" border stripe v-loading="loading" :row-class-name="rowClass">
				<el-table-column prop="namespace" label="namespace" width="130" show-overflow-tooltip />
				<el-table-column prop="name" label="实例名" min-width="240" show-overflow-tooltip />
				<el-table-column label="归属服务" min-width="140">
					<template #default="{ row }">
						<el-link v-if="row.service_ref" type="primary" @click="gotoService(row.service_ref)">{{ row.service_ref }}</el-link>
						<span v-else class="text-muted">-</span>
					</template>
				</el-table-column>
				<el-table-column label="状态" width="110" align="center">
					<template #default="{ row }">
						<PhaseTag :phase="row.phase" />
					</template>
				</el-table-column>
				<el-table-column prop="node_name" label="节点" min-width="150" show-overflow-tooltip>
					<template #default="{ row }">
						<span v-if="row.node_name">{{ row.node_name }}</span>
						<span v-else-if="row.phase === 'Pending'" class="text-muted">— 等待调度</span>
						<span v-else class="text-muted">-</span>
					</template>
				</el-table-column>
				<el-table-column label="GPU" width="70" align="center">
					<template #default="{ row }">{{ row.gpu_request > 0 ? row.gpu_request : '—' }}</template>
				</el-table-column>
				<el-table-column label="CPU / 内存 requests" min-width="150">
					<template #default="{ row }">
						<span v-if="row.cpu_request_milli || row.memory_request_mi" style="font-size: 12px">
							{{ row.cpu_request_milli ? (row.cpu_request_milli / 1000).toFixed(1) + ' 核' : '—' }} /
							{{ row.memory_request_mi ? row.memory_request_mi + ' Mi' : '—' }}
						</span>
						<span v-else class="text-muted">—</span>
					</template>
				</el-table-column>
				<el-table-column label="重启" width="70" align="center">
					<template #default="{ row }">
						<span :style="row.restarts > 0 ? 'color: var(--el-color-warning); font-weight: 500' : ''">{{ row.restarts }}</span>
					</template>
				</el-table-column>
				<el-table-column label="Age" width="110">
					<template #default="{ row }">{{ age(row.create_time) }}</template>
				</el-table-column>
				<el-table-column label="操作" width="210" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" @click="openLogs(row)">日志</el-button>
						<el-button link type="primary" :disabled="row.phase !== 'Running'" @click="openTerminal(row)">终端</el-button>
						<el-button link type="primary" @click="openEvents(row)">事件</el-button>
						<el-button link type="primary" @click="openRestart(row)">重启</el-button>
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

			<!-- 实例日志（SSE 跟随）/ 终端（WebSocket+录像）/ 事件抽屉 -->
			<PodLogsDrawer v-model="logsOpen" :pod="activePod" />
			<PodTerminalDrawer v-model="terminalOpen" :pod="activePod" />
			<PodEventsDrawer v-model="eventsOpen" :pod="activePod" />
		</template>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getClusterNodes, getClusterPods, restartPod, type ClusterPodItem } from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';
import PhaseTag from '/@/components/PhaseTag.vue';
import PodTerminalDrawer from '/@/components/PodTerminalDrawer.vue';
import PodEventsDrawer from '/@/components/PodEventsDrawer.vue';
import PodLogsDrawer from '/@/components/PodLogsDrawer.vue';

const router = useRouter();
const envStore = useEnvStore();

const keyword = ref('');
const namespace = ref('');
const phase = ref('');
const nodeName = ref('');
const loading = ref(false);
const autoRefresh = ref(true);
const paginator = reactive({ total: 0, list: [] as ClusterPodItem[], page: 1, size: 20 });
const nsOptions = ref<string[]>([]);
const nodeOptions = ref<string[]>([]);

// 日志/终端/事件抽屉：共用当前选中实例；终端打开后由抽屉内部自管 WS 生命周期
const logsOpen = ref(false);
const terminalOpen = ref(false);
const eventsOpen = ref(false);
const activePod = ref<ClusterPodItem | null>(null);

const openLogs = (row: ClusterPodItem) => {
	activePod.value = row;
	logsOpen.value = true;
};
const openTerminal = (row: ClusterPodItem) => {
	activePod.value = row;
	terminalOpen.value = true;
};
const openEvents = (row: ClusterPodItem) => {
	activePod.value = row;
	eventsOpen.value = true;
};

// 重启实例：删除 Pod 由控制器自动重建（二次确认防误触）
const openRestart = async (row: ClusterPodItem) => {
	try {
		await ElMessageBox.confirm(`确认重启实例 ${row.name}？将删除该实例并由控制器自动重建。`, '重启实例', {
			confirmButtonText: '重启',
			cancelButtonText: '取消',
			type: 'warning',
		});
	} catch {
		return;
	}
	await restartPod(row.name, { namespace: row.namespace });
	ElMessage.success('重启已触发，实例将由控制器自动重建');
	loadList();
};

let timer: number | undefined;

const loadList = async () => {
	if (!envStore.hasSelected) return;
	loading.value = true;
	try {
		const res: any = await getClusterPods({
			keyword: keyword.value || undefined,
			namespace: namespace.value || undefined,
			phase: phase.value || undefined,
			node_name: nodeName.value || undefined,
			page: paginator.page,
			size: paginator.size,
		});
		paginator.total = res?.total ?? 0;
		paginator.list = res?.list ?? [];
	} finally {
		loading.value = false;
	}
};

// 筛选下拉候选：从当前数据抽取（实例量级小，够用；量大时再上后端 distinct 接口）
const extractOptions = () => {
	const ns = new Set<string>();
	for (const p of paginator.list) if (p.namespace) ns.add(p.namespace);
	nsOptions.value = [...ns].sort();
};

const loadNodeOptions = async () => {
	const res: any = await getClusterNodes({ size: 100 });
	// 响应拦截器已把 envelope 的 data 负载直接返回，取 res.list（原 res.data?.list 恒为空）
	nodeOptions.value = (res?.list ?? []).map((n: any) => n.name);
};

const gotoService = (name: string) => router.push({ name: 'inferenceDetail', params: { name } });
const rowClass = ({ row }: { row: ClusterPodItem }) => (row.phase === 'Pending' ? 'pending-row' : '');
const age = (t: string) => {
	if (!t) return '-';
	const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
};

onMounted(() => {
	loadList();
	loadNodeOptions();
	if (autoRefresh.value) timer = window.setInterval(loadList, 30000);
});
watch(() => envStore.envId, () => {
	paginator.page = 1;
	keyword.value = namespace.value = phase.value = nodeName.value = '';
	// 切环境先收起抽屉，避免日志/终端/事件错连到新环境下的同名实例
	logsOpen.value = false;
	terminalOpen.value = false;
	eventsOpen.value = false;
	activePod.value = null;
	loadList();
	loadNodeOptions();
});
watch(autoRefresh, (on) => {
	if (on) timer = window.setInterval(loadList, 30000);
	else window.clearInterval(timer);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<style scoped>
:deep(.pending-row) {
	background: var(--el-color-warning-light-9);
}
</style>
