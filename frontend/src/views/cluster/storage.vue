<template>
	<div>
		<el-alert
			v-if="!envStore.hasSelected"
			title="请先在顶部选择环境（存储卷与环境 1:1 绑定），再查看存储卷"
			type="info"
			:closable="false"
			show-icon
			class="m-b-15"
		/>

		<template v-else>
			<el-alert
				title="存储卷由平台同步展示；删除 / 扩容仍在集群侧操作（多数存储类回收策略为 Delete，删盘会连带删除底层数据）"
				type="info"
				:closable="false"
				show-icon
				class="m-b-15"
			/>

			<div class="text-muted m-b-15" style="font-size: 12px">
				存储类（StorageClass）的清单与增删在左侧「存储类」菜单；本页只管存储卷（PVC）实例。卷的物理类型由所选存储类决定。
			</div>


			<div class="flex-between m-b-15">
				<div class="flex align-center">
					<el-input v-model="keyword" placeholder="搜索存储卷名" style="width: 200px; margin-right: 10px" clearable @keyup.enter="reload" />
					<el-select v-model="namespace" placeholder="命名空间" style="width: 150px; margin-right: 10px" clearable @change="reload">
						<el-option v-for="ns in nsOptions" :key="ns" :label="ns" :value="ns" />
					</el-select>
					<el-select v-model="phase" placeholder="状态" style="width: 120px; margin-right: 10px" clearable @change="reload">
						<el-option label="Bound（已绑定）" value="Bound" />
						<el-option label="Pending（未绑定）" value="Pending" />
						<el-option label="Lost（已丢失）" value="Lost" />
					</el-select>
					<el-checkbox v-model="onlyReferenced" style="margin-right: 10px" @change="reload">仅被引用</el-checkbox>
					<el-input
						v-model="modelFilter"
						placeholder="按关联模型过滤"
						style="width: 160px; margin-right: 10px"
						clearable
						@keyup.enter="reload"
						@clear="reload"
					/>
					<el-button :icon="Search" @click="reload">查询</el-button>
					<el-button v-if="userInfo.isAdmin" type="primary" :icon="Plus" @click="createVisible = true">新建存储卷</el-button>
				</div>
				<div class="flex align-center">
					<el-switch v-model="autoRefresh" size="small" style="margin-right: 6px" />
					<span class="text-muted" style="font-size: 12px">30s 自动刷新</span>
				</div>
			</div>

			<el-table :data="paginator.list" border stripe v-loading="loading" @row-click="openDetail" style="cursor: pointer">
				<el-table-column prop="name" label="存储卷" min-width="180" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="pvc-name">{{ row.name }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="namespace" label="命名空间" width="130" />
				<el-table-column label="状态" width="100" align="center">
					<template #default="{ row }">
						<el-tag :type="phaseType(row.phase)" size="small">{{ row.phase || '—' }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="容量" width="100" align="right">
					<template #default="{ row }">{{ fmtBytes(row.capacity_bytes || row.requested_bytes) }}</template>
				</el-table-column>
				<el-table-column label="访问模式" width="150">
					<template #default="{ row }">
						<el-tooltip
							v-for="m in modeList(row)"
							:key="m"
							:content="modeTip(m)"
							placement="top"
						>
							<el-tag :type="m === 'RWX' ? 'success' : 'info'" size="small" effect="plain" class="m-r-5">{{ m }}</el-tag>
						</el-tooltip>
						<span v-if="!modeList(row).length" class="text-muted">—</span>
					</template>
				</el-table-column>
				<el-table-column prop="storage_class" label="StorageClass" width="150" show-overflow-tooltip>
					<template #default="{ row }">{{ row.storage_class || '(默认)' }}</template>
				</el-table-column>
			<el-table-column label="被引用" width="130">
				<template #default="{ row }">
					<template v-if="row.referenced_by?.length">
						<el-tag size="small" type="warning" effect="plain">{{ row.referenced_by.length }} 个服务</el-tag>
					</template>
					<span v-else class="text-muted">未被引用</span>
				</template>
			</el-table-column>
			<el-table-column label="关联模型" min-width="180">
				<template #default="{ row }">
					<template v-if="row.bound_models?.length">
						<el-tooltip :content="boundModelTip(row)" placement="top">
							<span class="flex align-center" style="flex-wrap: wrap; gap: 4px">
								<el-tag
									v-for="m in row.bound_models"
									:key="m.model_name"
									size="small"
									effect="plain"
									:type="m.storage_type === 's3' ? 'success' : 'primary'"
								>
									{{ m.model_name }}
								</el-tag>
							</span>
						</el-tooltip>
					</template>
					<span v-else class="text-muted">未关联</span>
				</template>
			</el-table-column>
				<el-table-column prop="create_time" label="创建时间（集群侧）" width="180" />
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

			<!-- 存储卷详情抽屉：只读 + 引用反查（跨模块跳转的唯一入口） -->
			<el-drawer v-model="detailVisible" :title="current?.name" size="640px" destroy-on-close>
				<template v-if="current">
					<el-descriptions :column="2" border size="small" class="m-b-15">
						<el-descriptions-item label="命名空间">{{ current.namespace }}</el-descriptions-item>
						<el-descriptions-item label="状态">
							<el-tag :type="phaseType(current.phase)" size="small">{{ current.phase || '—' }}</el-tag>
						</el-descriptions-item>
						<el-descriptions-item label="声明容量">{{ fmtBytes(current.requested_bytes) }}</el-descriptions-item>
						<el-descriptions-item label="实际容量">{{ fmtBytes(current.capacity_bytes) }}</el-descriptions-item>
						<el-descriptions-item label="访问模式">
							<el-tag v-for="m in modeList(current)" :key="m" size="small" effect="plain" class="m-r-5">{{ m }}</el-tag>
							<span v-if="!modeList(current).length">—</span>
						</el-descriptions-item>
						<el-descriptions-item label="卷模式">{{ current.volume_mode || '—' }}</el-descriptions-item>
						<el-descriptions-item label="StorageClass">{{ current.storage_class || '(集群默认)' }}</el-descriptions-item>
						<el-descriptions-item label="绑定 PV">{{ current.volume_name || '未绑定' }}</el-descriptions-item>
						<el-descriptions-item label="集群侧创建时间" :span="2">{{ current.create_time }}</el-descriptions-item>
					</el-descriptions>

					<el-alert
						v-if="isRWX(current)"
						title="支持多副本 / 跨节点共享"
						description="含 RWX，可作为多个推理服务的共享权重盘（权重挂载点统一为 /models）。"
						type="success"
						:closable="false"
						show-icon
						class="m-b-15"
					/>
					<el-alert
						v-else
						title="不支持跨节点共享（仅 RWO）"
						description="多副本挂载时所有副本须落在同一节点；需要跨节点共享请让集群侧提供支持 RWX 的存储类（如 NFS / CephFS）。"
						type="warning"
						:closable="false"
						show-icon
						class="m-b-15"
					/>

					<div class="drawer-title">关联模型</div>
				<el-table v-if="current.bound_models?.length" :data="current.bound_models" size="small" border>
					<el-table-column label="模型" min-width="160">
						<template #default="{ row }">
							<el-link type="primary" @click="gotoModel(row.model_name)">{{ row.model_name }}</el-link>
						</template>
					</el-table-column>
					<el-table-column label="存储类型" width="130" align="center">
						<template #default="{ row }">
							<el-tag :type="row.storage_type === 's3' ? 'success' : 'primary'" size="small">
								{{ row.storage_type === 's3' ? 'S3 预热目标' : 'NAS 直通' }}
							</el-tag>
						</template>
					</el-table-column>
					<el-table-column label="来源" width="110" align="center">
						<template #default="{ row }">
							<el-tag size="small" effect="plain">{{ row.source === 'warmup' ? '预热记录' : '手工绑定' }}</el-tag>
						</template>
					</el-table-column>
				</el-table>
				<el-empty v-else :image-size="60" description="暂无模型关联此存储卷（可在模型详情「关联存储卷」中绑定）" />
				<div class="text-muted m-t-10" style="font-size: 12px; line-height: 1.6">
					关联取自 model_volume 绑定表与 S3 预热记录；推理服务选择该模型时，PVC 下拉只列出这里关联的卷。
				</div>

				<div class="drawer-title">被谁引用</div>
					<el-table v-if="current.referenced_by?.length" :data="current.referenced_by" size="small" border>
						<el-table-column label="推理服务" min-width="150">
							<template #default="{ row }">
								<el-link type="primary" @click="gotoService(row.service_name)">{{ row.service_name }}</el-link>
							</template>
						</el-table-column>
						<el-table-column prop="namespace" label="命名空间" width="120" />
						<el-table-column prop="model" label="模型" min-width="120" show-overflow-tooltip />
						<el-table-column prop="status" label="状态" width="100" />
					</el-table>
					<el-empty v-else :image-size="60" description="暂无推理服务引用此存储卷" />

					<div class="text-muted m-t-10" style="font-size: 12px; line-height: 1.6">
						引用关系取自推理服务配置（spec.model_cache_pvc），非集群实际挂载。非管理员仅显示您负责的服务树下的服务。
						集群侧删除存储卷前请先确认此列表为空——多数存储类的回收策略为 Delete，删盘会连带删除底层数据。
					</div>
				</template>
			</el-drawer>

			<!-- 受限创建：管理员主入口；与服务侧「就地新建」共用同一组件与 API -->
			<PvcCreateDialog v-model="createVisible" :namespace="namespace" :ns-suggestions="nsOptions" @created="reload" />
		</template>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Search } from '@element-plus/icons-vue';
import { getClusterPVCs, getPVCNamespaces, type ClusterPVCItem, type PVCModelRefItem } from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';
import { useUserInfo } from '/@/stores/userInfo';
import { withContextQuery } from '/@/utils/routeContext';
import PvcCreateDialog from '/@/components/PvcCreateDialog.vue';

const router = useRouter();
const route = useRoute();
const envStore = useEnvStore();

const keyword = ref('');
const namespace = ref('');
const phase = ref('');
const onlyReferenced = ref(false);
const modelFilter = ref(''); // 按关联模型过滤（模型-存储卷绑定 / 预热记录，服务端 model 参数）
const loading = ref(false);
const autoRefresh = ref(true);
const nsOptions = ref<string[]>([]);
const paginator = reactive({ total: 0, list: [] as ClusterPVCItem[], page: 1, size: 20 });
const userInfo = useUserInfo();
const createVisible = ref(false);

let timer: number | undefined;

const loadList = async () => {
	if (!envStore.hasSelected) return;
	loading.value = true;
	try {
		const res: any = await getClusterPVCs({
			keyword: keyword.value || undefined,
			namespace: namespace.value || undefined,
			phase: phase.value || undefined,
			referenced: onlyReferenced.value ? '1' : undefined,
			model: modelFilter.value.trim() || undefined,
			page: paginator.page,
			size: paginator.size,
		});
		paginator.total = res?.total ?? 0;
		paginator.list = res?.list ?? [];
	} finally {
		loading.value = false;
	}
};

const loadNamespaces = async () => {
	if (!envStore.hasSelected) return;
	const res: any = await getPVCNamespaces();
	nsOptions.value = res?.list ?? [];
};

const reload = () => {
	paginator.page = 1;
	loadList();
	loadNamespaces();
};

// ---- 详情抽屉 ----
const detailVisible = ref(false);
const current = ref<ClusterPVCItem | null>(null);

const openDetail = (row: ClusterPVCItem) => {
	current.value = row;
	detailVisible.value = true;
};

// 跨模块跳转的唯一位置：从资源反查消费者（只读查看，不回写）
const gotoService = (name: string) => router.push(`/inference/detail/${encodeURIComponent(name)}`);
// 从存储卷反查模型：带 envid 上下文，避免跳过去落到别的环境（模型-卷绑定按环境隔离）
const gotoModel = (name: string) =>
	router.push({ path: `/model/detail/${encodeURIComponent(name)}`, query: withContextQuery(route.query) });

// 关联模型悬浮说明：模型名 + 存储类型 + 关联来源（绑定 / 预热）
const boundModelTip = (row: ClusterPVCItem) =>
	(row.bound_models || [])
		.map(
			(m: PVCModelRefItem) =>
				`${m.model_name}（${m.storage_type === 's3' ? 'S3 预热目标' : 'NAS 直通'} · ${m.source === 'warmup' ? '预热记录' : '手工绑定'}）`
		)
		.join('、');

// ---- 展示辅助 ----
const fmtBytes = (bytes?: number) => {
	const n = Number(bytes || 0);
	if (!n) return '—';
	const gi = n / 1024 ** 3;
	if (gi >= 1024) return `${(gi / 1024).toFixed(2)} Ti`;
	if (gi >= 1) return `${gi % 1 === 0 ? gi : gi.toFixed(1)} Gi`;
	return `${Math.max(1, Math.round(n / 1024 ** 2))} Mi`;
};

const modeList = (row: ClusterPVCItem) => (row.access_modes || '').split(',').filter(Boolean);
const isRWX = (row: ClusterPVCItem) => modeList(row).includes('RWX');
const modeTip = (m: string) =>
	({
		RWO: 'ReadWriteOnce：单节点读写，多副本须同节点',
		ROX: 'ReadOnlyMany：多节点只读',
		RWX: 'ReadWriteMany：多节点读写，可多副本共享',
		RWOP: 'ReadWriteOncePod：仅单 Pod 读写',
	}[m] || m);
const phaseType = (p: string) => (p === 'Bound' ? 'success' : p === 'Pending' ? 'warning' : p === 'Lost' ? 'danger' : 'info');

const startTimer = () => {
	stopTimer();
	timer = window.setInterval(loadList, 30000);
};
const stopTimer = () => {
	if (timer) {
		window.clearInterval(timer);
		timer = undefined;
	}
};

onMounted(() => {
	reload();
	if (autoRefresh.value) startTimer();
});
onBeforeUnmount(stopTimer);
watch(autoRefresh, (on) => (on ? startTimer() : stopTimer()));
watch(() => envStore.currentEnv?.id, () => reload());
</script>

<style scoped>
.pvc-name {
	font-family: var(--el-font-family-mono, monospace);
	font-size: 13px;
}
.drawer-title {
	font-size: 14px;
	font-weight: 500;
	margin: 4px 0 10px;
}
</style>
