<template>
	<div>
		<el-alert v-if="!envStore.hasSelected" title="请先在顶部选择环境（集群与环境 1:1 绑定），再管理节点池" type="info" :closable="false" show-icon class="m-b-15" />

		<template v-else>
			<el-alert
				v-if="unassigned > 0"
				type="warning"
				:closable="false"
				show-icon
				class="m-b-15"
				:title="`有 ${unassigned} 个节点未纳入任何节点池（游离节点）`"
			>
				<div class="text-muted" style="font-size: 12px">
					游离节点是真实存在的运维视图：节点上没有任何能匹配到池的标签。给节点打上池标签，或在下方创建对应的节点池即可纳管。
				</div>
			</el-alert>

			<div class="flex-between m-b-15">
				<div>
					<el-input v-model="keyword" placeholder="搜索池名 / 显示名" style="width: 220px; margin-right: 10px" clearable @keyup.enter="loadList" />
					<el-button :icon="Search" @click="loadList">查询</el-button>
					<el-button :icon="Refresh" @click="loadList" :loading="loading">刷新</el-button>
				</div>
				<div class="flex align-center">
					<el-button type="primary" :icon="Plus" @click="openCreate()">创建节点池</el-button>
				</div>
			</div>

			<el-table :data="filtered" border stripe v-loading="loading" style="cursor: pointer" @row-click="openDetail">
				<el-table-column label="节点池" min-width="200" show-overflow-tooltip>
					<template #default="{ row }">
						<div class="pool-name">{{ row.display_name || row.name }}</div>
						<div class="text-muted" style="font-size: 12px">{{ row.name }}</div>
					</template>
				</el-table-column>
				<el-table-column label="来源" width="130" align="center">
					<template #default="{ row }">
						<el-tag v-if="row.source === 'registered'" size="small" type="success" effect="plain">已登记</el-tag>
						<el-tooltip v-else content="节点上带着池标签，但平台还没有对应的池记录（L1 反推）" placement="top">
							<el-tag size="small" type="warning" effect="plain">未登记</el-tag>
						</el-tooltip>
					</template>
				</el-table-column>
				<el-table-column label="模式" width="140">
					<template #default="{ row }">
						<el-tooltip :content="modeTip(row.mode)" placement="top">
							<el-tag size="small" type="info" effect="plain">{{ modeText(row.mode) }}</el-tag>
						</el-tooltip>
					</template>
				</el-table-column>
				<el-table-column label="节点" width="130" align="center">
					<template #default="{ row }">
						<span :class="{ 'text-warn': row.agg.node_count === 0 }">{{ row.agg.node_count }}</span>
						<span v-if="row.agg.not_ready_count > 0" class="text-danger" style="font-size: 12px">
							（{{ row.agg.not_ready_count }} 异常）
						</span>
					</template>
				</el-table-column>
				<el-table-column label="GPU（已分配/总）" min-width="150">
					<template #default="{ row }">
						<template v-if="row.agg.gpu_total > 0">
							<el-tag size="small" class="m-r-5">{{ gpuShort(row.agg.gpu_products) }} ×{{ row.agg.gpu_total }}</el-tag>
							<span class="text-muted" style="font-size: 12px">{{ row.agg.gpu_allocated }}/{{ row.agg.gpu_total }}</span>
						</template>
						<span v-else class="text-muted">无 GPU</span>
					</template>
				</el-table-column>
				<el-table-column label="单节点最大卡数" width="130" align="center">
					<template #default="{ row }">
						<span v-if="row.agg.gpu_per_node_max > 0">{{ row.agg.gpu_per_node_max }}</span>
						<span v-else class="text-muted">—</span>
					</template>
				</el-table-column>
				<el-table-column label="驱动 / CUDA" min-width="140">
					<template #default="{ row }">
						<template v-if="row.agg.driver_cuda">
							<div style="font-size: 12px">{{ row.agg.driver_version || '-' }}</div>
							<div class="text-muted" style="font-size: 12px">CUDA {{ row.agg.driver_cuda }}</div>
						</template>
						<el-tooltip v-else content="节点 label 上未采集到驱动版本，CUDA 兼容校验将降级为提醒（不静默放行）" placement="top">
							<span class="text-muted" style="font-size: 12px">未采集</span>
						</el-tooltip>
					</template>
				</el-table-column>
				<el-table-column label="选择器" min-width="200" show-overflow-tooltip>
					<template #default="{ row }">
						<el-tag v-for="kv in selectorPairs(row)" :key="kv" size="small" class="m-r-5 m-b-2" type="warning" effect="plain">{{ kv }}</el-tag>
						<span v-if="selectorPairs(row).length === 0" class="text-muted" style="font-size: 12px">由云侧池 ID 标签自动归属</span>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="170" fixed="right">
					<template #default="{ row }">
						<el-button v-if="row.source === 'observed'" size="small" type="primary" plain @click.stop="openCreate(row)">登记</el-button>
						<el-button v-else size="small" @click.stop="openDetail(row)">详情</el-button>
						<el-button v-if="row.source === 'registered'" size="small" type="danger" plain @click.stop="removePool(row)">删除</el-button>
					</template>
				</el-table-column>
				<template #empty>
					<div class="empty-box">
						<div>当前环境还没有节点池。</div>
						<div class="text-muted" style="font-size: 12px; margin-top: 6px">
							节点池 = 一组节点标签的命名约定。创建后，<b>符合 selector 的节点会自动成为成员</b>（成员是标签求出来的物化视图，不靠手工维护）。
						</div>
					</div>
				</template>
			</el-table>

			<!-- 详情抽屉 -->
			<el-drawer v-model="detailVisible" :title="detailPool?.display_name || detailPool?.name" size="760px" destroy-on-close>
				<template v-if="detailPool">
					<el-alert
						v-if="detailPool.source === 'observed'"
						type="warning"
						:closable="false"
						show-icon
						class="m-b-12"
						title="该节点池尚未登记"
						description="成员是通过节点上的池标签反推出来的（L1 零凭据反推）。登记后平台才会保存它的元数据。"
					/>

					<h4 class="drawer-sec">基础信息</h4>
					<el-descriptions :column="2" border size="small">
						<el-descriptions-item label="池名">{{ detailPool.name }}</el-descriptions-item>
						<el-descriptions-item label="显示名">{{ detailPool.display_name || '—' }}</el-descriptions-item>
						<el-descriptions-item label="集群类型">{{ detailPool.provider }}</el-descriptions-item>
						<el-descriptions-item label="池类型">{{ detailPool.pool_type || '—' }}</el-descriptions-item>
						<el-descriptions-item label="云侧池 ID">{{ detailPool.pool_id || '—（native 无外部 ID）' }}</el-descriptions-item>
						<el-descriptions-item label="归属键（Key）">{{ detailPool.key }}</el-descriptions-item>
						<el-descriptions-item label="模式">{{ modeText(detailPool.mode) }}</el-descriptions-item>
						<el-descriptions-item label="优先级">{{ detailPool.priority }}</el-descriptions-item>
						<el-descriptions-item label="描述" :span="2">{{ detailPool.description || '—' }}</el-descriptions-item>
					</el-descriptions>

					<h4 class="drawer-sec">成员判定（selector）</h4>
					<div class="m-b-10">
						<el-tag v-for="kv in selectorPairs(detailPool)" :key="kv" size="small" class="m-r-5 m-b-5" type="warning" effect="plain">{{ kv }}</el-tag>
						<span v-if="selectorPairs(detailPool).length === 0" class="text-muted" style="font-size: 12px">
							托管集群由节点上的云侧池 ID 标签直接归属；native 集群需在 selector 里声明条件。
						</span>
					</div>
					<div class="form-tip">
						成员是<b>物化视图</b>：由 K8s 标签求解得出，节点标签一变成员就跟着变。这里改不了成员——要改成员，请改节点标签或池的 selector。
					</div>

					<h4 class="drawer-sec">容量聚合（实时）</h4>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="节点数">{{ detailPool.agg.node_count }}</el-descriptions-item>
						<el-descriptions-item label="Ready">{{ detailPool.agg.ready_count }}</el-descriptions-item>
						<el-descriptions-item label="异常">{{ detailPool.agg.not_ready_count }}</el-descriptions-item>
						<el-descriptions-item label="GPU 总量">{{ detailPool.agg.gpu_total }}</el-descriptions-item>
						<el-descriptions-item label="GPU 已分配">{{ detailPool.agg.gpu_allocated }}</el-descriptions-item>
						<el-descriptions-item label="单节点最大卡数">{{ detailPool.agg.gpu_per_node_max }}</el-descriptions-item>
						<el-descriptions-item label="CPU 可分配">{{ (detailPool.agg.cpu_allocatable_milli / 1000).toFixed(1) }} 核</el-descriptions-item>
						<el-descriptions-item label="内存可分配">{{ (detailPool.agg.memory_allocatable_mi / 1024).toFixed(1) }} Gi</el-descriptions-item>
						<el-descriptions-item label="卡型">{{ detailPool.agg.gpu_products.join(' / ') || '—' }}</el-descriptions-item>
						<el-descriptions-item label="驱动版本" :span="1">{{ detailPool.agg.driver_version || '未采集' }}</el-descriptions-item>
						<el-descriptions-item label="CUDA 运行时" :span="2">{{ detailPool.agg.driver_cuda || '未采集' }}</el-descriptions-item>
					</el-descriptions>
					<el-alert
						v-if="!detailPool.agg.driver_cuda && detailPool.agg.gpu_total > 0"
						type="warning"
						:closable="false"
						show-icon
						class="m-t-10"
						title="驱动版本未采集"
						description="该环境的节点 label 里没有驱动版本信息（ACK/TKE 的 key 尚未核实）。推理创建时的 CUDA 兼容校验会降级为提醒，不会静默放行。"
					/>

					<h4 class="drawer-sec">成员节点（{{ members.length }}）</h4>
					<el-table :data="members" size="small" border max-height="300">
						<el-table-column prop="name" label="节点" min-width="160" show-overflow-tooltip />
						<el-table-column label="状态" width="100" align="center">
							<template #default="{ row }">
								<el-tag size="small" :type="row.status === 'Ready' ? 'success' : row.status === 'Unknown' ? 'info' : 'danger'">{{ row.status }}</el-tag>
							</template>
						</el-table-column>
						<el-table-column label="GPU" width="140">
							<template #default="{ row }">
								<span v-if="row.gpu_count > 0">{{ gpuProductShort(row.gpu_product) }} ×{{ row.gpu_count }}</span>
								<span v-else class="text-muted">—</span>
							</template>
						</el-table-column>
						<el-table-column label="已分配" width="90" align="center">
							<template #default="{ row }">{{ row.gpu_count > 0 ? row.allocated_gpu + '/' + row.gpu_count : '—' }}</template>
						</el-table-column>
						<el-table-column label="入池时间" min-width="160">
							<template #default="{ row }">{{ formatTime(row.pool_joined_at) }}</template>
						</el-table-column>
					</el-table>
				</template>
			</el-drawer>

			<!-- 创建 / 登记弹窗 -->
			<el-dialog v-model="createVisible" :title="isImporting ? '登记节点池' : '创建节点池'" width="760px" :close-on-click-modal="false">
				<el-alert
					type="info"
					:closable="false"
					show-icon
					class="m-b-12"
					title="节点池不是「节点名单」，而是一个带名字的标签选择条件"
					description="创建后，节点会被自动归类：符合 selector 的节点成为成员；节点标签一变，成员跟着变（无需手工维护名单）。"
				/>
				<el-form :model="form" label-width="110px" :disabled="isImporting">
					<el-form-item label="池名" required>
						<el-input v-model="form.name" placeholder="小写字母/数字/中划线，如 prod-a100" :disabled="isImporting" />
					</el-form-item>
					<el-form-item label="显示名">
						<el-input v-model="form.display_name" placeholder="如 生产 A100 池" />
					</el-form-item>
					<el-form-item label="描述">
						<el-input v-model="form.description" type="textarea" :rows="2" placeholder="用途说明（选填）" />
					</el-form-item>
					<el-form-item label="云侧池 ID" v-if="isImporting">
						<el-input v-model="form.pool_id" disabled />
					</el-form-item>
					<el-form-item label="登记节点数">
						<el-input-number v-model="form.declared_size" :min="0" />
						<div class="form-tip">平台不自动扩缩容，这里只是登记目标数，便于和实际成员数对比</div>
					</el-form-item>
				</el-form>

				<div v-if="!isImporting">
					<h4 class="drawer-sec">选择器（成员判定条件，AND 关系）</h4>
					<div class="m-b-10">
						<el-tag v-for="(kv, i) in selectorRows" :key="i" closable size="small" class="m-r-5 m-b-5" type="warning" @close="selectorRows.splice(i, 1)">
							{{ kv.key }}={{ kv.value }}
						</el-tag>
						<span v-if="selectorRows.length === 0" class="text-muted" style="font-size: 12px">尚未选择条件 —— 未选条件时创建出来的池不会命中任何节点</span>
					</div>
					<div class="flex align-center m-b-10">
						<el-input v-model="manualKey" placeholder="标签 key" style="width: 240px; margin-right: 6px" />
						<span class="label-eq">=</span>
						<el-input v-model="manualValue" placeholder="标签 value" style="width: 200px; margin-right: 10px" />
						<el-button size="small" plain @click="addManualSelector">添加条件</el-button>
					</div>
					<div class="text-muted m-b-5" style="font-size: 12px">或从当前集群节点上真实存在的标签里点选：</div>
					<div class="label-picker">
						<el-tag
							v-for="opt in labelOptions"
							:key="opt.key + '=' + opt.value"
							size="small"
							class="m-r-5 m-b-5 picker-tag"
							:type="isPicked(opt) ? 'success' : 'info'"
							:effect="isPicked(opt) ? 'dark' : 'plain'"
							@click="toggleSelector(opt)"
						>
							{{ opt.key }}={{ opt.value || '""' }} <span class="picker-count">×{{ opt.nodes }}</span>
						</el-tag>
					</div>
				</div>

				<template #footer>
					<el-button @click="createVisible = false">取消</el-button>
					<el-button type="primary" :loading="saving" @click="submitCreate">{{ isImporting ? '登记' : '创建' }}</el-button>
				</template>
			</el-dialog>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import {
	getNodePools,
	getNodePool,
	createNodePool,
	deleteNodePool,
	getNodeLabelOptions,
	type ClusterPoolItem,
	type ClusterNodeItem,
	type NodeLabelOption,
} from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';

const envStore = useEnvStore();

const loading = ref(false);
const keyword = ref('');
const pools = ref<ClusterPoolItem[]>([]);
const unassigned = ref(0);

const loadList = async () => {
	if (!envStore.hasSelected) return;
	loading.value = true;
	try {
		const res: any = await getNodePools();
		pools.value = res?.list ?? [];
		unassigned.value = res?.unassigned_nodes ?? 0;
	} finally {
		loading.value = false;
	}
};

const filtered = computed(() => {
	const kw = keyword.value.trim().toLowerCase();
	if (!kw) return pools.value;
	return pools.value.filter((p) => (p.name + (p.display_name || '')).toLowerCase().includes(kw));
});

// ---- 详情 ----
const detailVisible = ref(false);
const detailPool = ref<ClusterPoolItem | null>(null);
const members = ref<ClusterNodeItem[]>([]);

const openDetail = async (row: ClusterPoolItem) => {
	const res: any = await getNodePool(row.key);
	detailPool.value = res?.pool ?? null;
	members.value = res?.members ?? [];
	detailVisible.value = true;
};

// ---- 创建 / 登记 ----
const createVisible = ref(false);
const saving = ref(false);
const isImporting = ref(false);
const selectorRows = ref<{ key: string; value: string }[]>([]);
const labelOptions = ref<NodeLabelOption[]>([]);
const manualKey = ref('');
const manualValue = ref('');

const form = reactive({ name: '', display_name: '', description: '', pool_id: '', declared_size: 0 });

const openCreate = async (observed?: ClusterPoolItem) => {
	isImporting.value = !!observed;
	if (observed) {
		// 登记：池名 = 归属键，同时沿用云侧池 ID，登记后成员归属立即对齐
		Object.assign(form, { name: observed.name, display_name: observed.display_name, description: '', pool_id: observed.pool_id || observed.key, declared_size: 0 });
		selectorRows.value = [];
	} else {
		Object.assign(form, { name: '', display_name: '', description: '', pool_id: '', declared_size: 0 });
		selectorRows.value = [];
	}
	manualKey.value = '';
	manualValue.value = '';
	createVisible.value = true;
	if (labelOptions.value.length === 0) {
		const res: any = await getNodeLabelOptions();
		labelOptions.value = res?.list ?? [];
	}
};

const addManualSelector = () => {
	const k = manualKey.value.trim();
	if (!k) return ElMessage.warning('请填写标签 key');
	if (selectorRows.value.some((r) => r.key === k)) return ElMessage.warning(`条件重复：${k}`);
	selectorRows.value.push({ key: k, value: manualValue.value.trim() });
	manualKey.value = '';
	manualValue.value = '';
};

const isPicked = (opt: NodeLabelOption) => selectorRows.value.some((r) => r.key === opt.key && r.value === opt.value);

const toggleSelector = (opt: NodeLabelOption) => {
	const i = selectorRows.value.findIndex((r) => r.key === opt.key && r.value === opt.value);
	if (i >= 0) selectorRows.value.splice(i, 1);
	else selectorRows.value.push({ key: opt.key, value: opt.value });
};

const submitCreate = async () => {
	if (!form.name.trim()) return ElMessage.warning('请填写池名');
	if (!isImporting.value && selectorRows.value.length === 0) {
		return ElMessage.warning('请至少选择一个 selector 条件，否则该池不会命中任何节点');
	}
	saving.value = true;
	try {
		const selector: Record<string, string> = {};
		for (const r of selectorRows.value) selector[r.key] = r.value;
		await createNodePool({
			name: form.name.trim(),
			display_name: form.display_name.trim(),
			description: form.description,
			pool_id: form.pool_id || undefined,
			selector: isImporting.value ? undefined : selector,
			declared_size: form.declared_size,
		});
		ElMessage.success(isImporting.value ? '已登记，成员归属已对齐' : '节点池已创建，成员归属已生效');
		createVisible.value = false;
		await loadList();
	} finally {
		saving.value = false;
	}
};

const removePool = async (row: ClusterPoolItem) => {
	await ElMessageBox.confirm(
		`删除节点池「${row.display_name || row.name}」？池记录会被删除，节点上的标签不受影响；若仍有节点匹配其 selector，它们会退回「游离节点」。`,
		'删除确认',
		{ type: 'warning' }
	).catch(() => 'cancel');
	try {
		await deleteNodePool(row.key);
		ElMessage.success('已删除');
		await loadList();
	} catch {
		/* 被引用时后端返回 41206，拦截器已提示 */
	}
};

// ---- 展示辅助 ----
const parseSelector = (p: ClusterPoolItem): Record<string, string> => {
	try {
		return JSON.parse(p.selector || '{}');
	} catch {
		return {};
	}
};
const selectorPairs = (p: ClusterPoolItem) => Object.entries(parseSelector(p)).map(([k, v]) => `${k}=${v || '""'}`);
const modeText = (m: string) => ({ reference: '引用已有标签', platform: '平台管理标签', cloud: '云侧池配置' } as Record<string, string>)[m] || m;
const modeTip = (m: string) =>
	({
		reference: '引用节点上已有的标签，平台一个标签都不写，创建即生效',
		platform: '平台在 pool.platform.io/ 命名空间内给节点打标',
		cloud: '池配置权威在云侧（ACK/TKE），平台只读镜像',
	} as Record<string, string>)[m] || '';
const gpuShort = (products: string[]) => (products.length === 0 ? 'GPU' : gpuProductShort(products[0]) + (products.length > 1 ? ' 等' : ''));
const gpuProductShort = (p: string) => (p || '').replace(/^nvidia\.com\//, '').replace(/^NVIDIA-?/i, '');
const formatTime = (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—');

onMounted(loadList);
watch(
	() => envStore.envId,
	() => {
		labelOptions.value = [];
		loadList();
	}
);
</script>

<style scoped>
.pool-name {
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
.m-b-2 {
	margin-bottom: 2px;
}
.m-b-12 {
	margin-bottom: 12px;
}
.label-eq {
	margin: 0 6px;
	color: var(--el-text-color-secondary);
}
.label-picker {
	max-height: 220px;
	overflow-y: auto;
	border: 1px solid var(--el-border-color-lighter);
	border-radius: 6px;
	padding: 8px;
}
.picker-tag {
	cursor: pointer;
}
.picker-count {
	opacity: 0.6;
	font-size: 11px;
	margin-left: 2px;
}
.empty-box {
	padding: 24px 0;
	text-align: center;
}
.text-warn {
	color: var(--el-color-warning);
}
.text-danger {
	color: var(--el-color-danger);
}
.text-muted {
	color: var(--el-text-color-secondary);
}
.form-tip {
	font-size: 12px;
	color: var(--el-text-color-secondary);
	line-height: 1.6;
}
</style>
