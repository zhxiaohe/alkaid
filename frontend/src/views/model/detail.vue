<template>
	<div v-loading="loading">
		<el-page-header @back="router.back()" class="m-b-15">
			<template #content>
				<span class="page-title">{{ meta.name || name }}</span>
				<el-tag v-if="meta.service_tree_id" size="small" type="warning" class="m-l-10">私有</el-tag>
				<el-tag v-else size="small" type="info" class="m-l-10">公共基座</el-tag>
			</template>
			<template #extra>
				<el-button type="primary" :icon="Plus" @click="openAddVersion">新增版本</el-button>
			</template>
		</el-page-header>

		<el-card class="m-b-15" shadow="never">
			<template #header>模型元信息</template>
			<el-descriptions :column="3" border>
				<el-descriptions-item label="模型名">{{ meta.name }}</el-descriptions-item>
				<el-descriptions-item label="基座">{{ meta.base }}</el-descriptions-item>
				<el-descriptions-item label="参数量">{{ meta.params }}</el-descriptions-item>
				<el-descriptions-item label="最新版本">{{ meta.latest_version }}</el-descriptions-item>
				<el-descriptions-item label="框架">{{ meta.framework }}</el-descriptions-item>
				<el-descriptions-item label="大小">{{ meta.size_gb }} GB</el-descriptions-item>
				<el-descriptions-item label="S3 存储" :span="2">{{ meta.storage_path || '—' }}</el-descriptions-item>
				<el-descriptions-item label="NAS 缓存">{{ meta.cache_nas || '—' }}</el-descriptions-item>
				<el-descriptions-item label="本地路径" :span="2">{{ meta.local_path || '—' }}</el-descriptions-item>
				<el-descriptions-item label="录入时间">{{ meta.created_at }}</el-descriptions-item>
			</el-descriptions>
		</el-card>

		<el-card shadow="never">
			<template #header>
				<div class="flex-between">
					<span>版本列表（状态机：staged → production → archived）</span>
					<el-button :icon="Refresh" size="small" link @click="loadDetail">刷新</el-button>
				</div>
			</template>
			<el-table :data="versions" border stripe>
				<el-table-column prop="version" label="版本" width="100" />
				<el-table-column label="状态" width="120" align="center">
					<template #default="{ row }">
						<el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="size_gb" label="大小(GB)" width="110" align="center" />
				<el-table-column prop="storage_path" label="存储路径" min-width="240" show-overflow-tooltip />
				<el-table-column prop="created_at" label="创建时间" width="170" />
				<el-table-column prop="promoted_by" label="promote 人" width="110" align="center">
					<template #default="{ row }">{{ row.promoted_by || '—' }}</template>
				</el-table-column>
				<el-table-column prop="promoted_at" label="promote 时间" width="170">
					<template #default="{ row }">{{ row.promoted_at || '—' }}</template>
				</el-table-column>
				<el-table-column label="操作" width="290" fixed="right">
					<template #default="{ row }">
						<el-button v-if="row.status === 'staged'" link type="success" @click="handlePromote(row)">Promote</el-button>
						<el-button v-if="(row.storage_path || '').startsWith('s3://') && userInfo.isAdmin" link type="primary" @click="openWarmup(row)">预热</el-button>
						<el-button v-if="row.status === 'production'" link type="warning" @click="openRollback(row)">Rollback</el-button>
						<el-button v-if="['staged', 'production'].includes(row.status)" link type="info" @click="handleArchive(row)">Archive</el-button>
						<el-button v-if="row.status === 'production'" link type="primary" @click="goDeploy(row)">部署</el-button>
					</template>
				</el-table-column>
			</el-table>
			<el-alert
				type="info"
				:closable="false"
				show-icon
				class="m-t-15"
				title="同一模型同时仅 1 个 production 版本；promote 时旧 production 自动 archived；rollback 将触发关联推理服务 Deployment rollout"
			/>
		</el-card>

		<!-- 模型-存储卷绑定：模型与 PVC 的显式关联（手工绑定 + 预热自动建立），推理表单按此过滤 -->
		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="flex-between">
					<span>关联存储卷（当前环境）</span>
					<div class="flex align-center">
						<el-button :icon="Refresh" size="small" link @click="loadVolumes">刷新</el-button>
						<el-button size="small" @click="openBindExisting">绑定已有存储卷</el-button>
						<el-button v-if="userInfo.isAdmin" type="primary" size="small" :icon="Plus" @click="openCreateVolume">新建存储卷并绑定</el-button>
					</div>
				</div>
			</template>
			<el-table :data="volumes" border stripe size="small">
				<el-table-column label="存储卷" min-width="200">
					<template #default="{ row }"><code>{{ row.namespace }}/{{ row.pvc_name }}</code></template>
				</el-table-column>
				<el-table-column label="存储类型" width="130" align="center">
					<template #default="{ row }">
						<el-tag :type="row.storage_type === 's3' ? 'success' : 'primary'" size="small">
							{{ row.storage_type === 's3' ? 'S3 预热目标' : 'NAS 直通' }}
						</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="落盘目录" min-width="160" show-overflow-tooltip>
					<template #default="{ row }"><code>/models/{{ row.dest_dir || modelDirName }}</code></template>
				</el-table-column>
				<el-table-column label="卷状态" width="100" align="center">
					<template #default="{ row }">
						<el-tag v-if="row.pvc_phase" :type="row.pvc_phase === 'Bound' ? 'success' : 'warning'" size="small">{{ row.pvc_phase }}</el-tag>
						<span v-else class="text-muted">已删除</span>
					</template>
				</el-table-column>
				<el-table-column prop="created_by" label="绑定人" width="90" align="center">
					<template #default="{ row }">{{ row.created_by || '—' }}</template>
				</el-table-column>
				<el-table-column prop="created_at" label="绑定时间" width="170" />
				<el-table-column label="操作" width="80" align="center">
					<template #default="{ row }">
						<el-button link type="danger" size="small" @click="handleUnbind(row)">解绑</el-button>
					</template>
				</el-table-column>
				<template #empty>
					<el-empty
						description="暂无关联存储卷：可「新建存储卷并绑定」（选 S3 预热目标 / NAS 直通），或绑定本环境已有卷；发起 S3 预热也会自动建立关联"
						:image-size="60"
					/>
				</template>
			</el-table>
			<div class="text-muted m-t-10" style="font-size: 12px; line-height: 1.6">
				绑定关系按环境隔离（PVC 是环境级资源）；绑定后，新建/编辑推理服务选择该模型时，PVC 下拉只列出这里关联的卷。
				解绑不影响集群内卷与其数据。
			</div>
		</el-card>

		<!-- 权重预热记录：S3 → PVC 灌数账本（状态懒回读集群 Job） -->
		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="flex-between">
					<span>权重预热记录（S3 → PVC 灌数）</span>
					<el-button :icon="Refresh" size="small" link @click="loadWarmups">刷新</el-button>
				</div>
			</template>
			<el-table :data="warmups" border stripe size="small">
				<el-table-column prop="version" label="版本" width="80" />
				<el-table-column label="目标卷" min-width="180">
					<template #default="{ row }">{{ row.namespace }}/{{ row.pvc_name }}</template>
				</el-table-column>
				<el-table-column prop="dest_dir" label="落盘目录" min-width="180" show-overflow-tooltip>
					<template #default="{ row }"><code>/models/{{ row.dest_dir }}</code></template>
				</el-table-column>
				<el-table-column label="状态" width="90" align="center">
					<template #default="{ row }">
						<el-tag :type="warmupTagType(row.status)" size="small">{{ row.status }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="message" label="说明" min-width="240" show-overflow-tooltip />
				<el-table-column prop="created_by" label="发起人" width="90" align="center" />
				<el-table-column prop="updated_at" label="更新时间" width="170" />
				<el-table-column v-if="userInfo.isAdmin" label="操作" width="80" align="center">
					<template #default="{ row }">
						<el-button link type="danger" size="small" @click="handleDeleteWarmup(row)">删除</el-button>
					</template>
				</el-table-column>
				<template #empty>
					<el-empty description="暂无预热记录：对 s3:// 版本点「预热」，把权重灌入目标存储卷后即可供推理服务挂载" :image-size="60" />
				</template>
			</el-table>
		</el-card>

		<!-- 预热弹窗（在根 div 内保持单根 —— transition mode=out-in 下多根会卡死路由） -->
		<PvcWarmupDialog
			v-model="warmupVisible"
			:model="name"
			:version="warmupVersion"
			:storage-path="warmupStoragePath"
			:cache-nas="meta.cache_nas"
			:local-path="meta.local_path"
			@created="loadWarmups"
		/>

		<!-- 新建存储卷并绑定（与集群页/服务侧同一组件同一 API；模型上下文下选存储类型后自动绑定） -->
		<PvcCreateDialog
			v-model="createVolumeVisible"
			:namespace="''"
			:ns-suggestions="volumeNsOptions"
			:default-name="volumeDefaultName"
			:model="name"
			:model-dir="modelDirName"
			@created="loadVolumes"
		/>

		<!-- 绑定已有存储卷 -->
		<el-dialog v-model="bindVisible" title="绑定已有存储卷" width="520px" :close-on-click-modal="false">
			<el-form label-width="96px" @submit.prevent>
				<el-form-item label="存储卷" required>
					<el-select v-model="bindForm.pvcKey" filterable placeholder="选择本环境的存储卷" style="width: 100%" :loading="bindPvcLoading">
						<el-option
							v-for="p in bindPvcOptions"
							:key="`${p.namespace}/${p.name}`"
							:value="`${p.namespace}/${p.name}`"
							:label="`${p.namespace}/${p.name}（${p.phase || '—'} · ${fmtGiB(p.capacity_bytes || p.requested_bytes)}）`"
						/>
					</el-select>
					<div class="form-tip">仅列出当前环境集群镜像中的存储卷</div>
				</el-form-item>
				<el-form-item label="存储类型" required>
					<el-radio-group v-model="bindForm.storage_type">
						<el-radio-button label="s3">S3 预热目标</el-radio-button>
						<el-radio-button label="nas">NAS 缓存直通</el-radio-button>
					</el-radio-group>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="bindVisible = false">取消</el-button>
				<el-button type="primary" :loading="bindSubmitting" @click="submitBind">绑定</el-button>
			</template>
		</el-dialog>

		<!-- 新增版本 -->
		<el-dialog v-model="addVersionVisible" title="新增版本" width="520px" :close-on-click-modal="false">
			<el-form ref="addFormRef" :model="versionForm" :rules="versionRules" label-width="100px">
				<el-form-item label="版本号" prop="version">
					<el-input v-model="versionForm.version" placeholder="如 v1.2" />
				</el-form-item>
				<el-form-item label="存储路径" prop="storage_path">
					<el-input v-model="versionForm.storage_path" placeholder="s3://bucket-name/.../v1.2/" />
				</el-form-item>
				<el-form-item label="大小(GB)">
					<el-input-number v-model="versionForm.size_gb" :min="0" :step="0.1" :precision="1" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="addVersionVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitAddVersion">新增</el-button>
			</template>
		</el-dialog>

		<!-- Rollback 选择目标版本 -->
		<el-dialog v-model="rollbackVisible" title="回滚到历史版本" width="480px">
			<el-form label-width="100px">
				<el-form-item label="当前生产版本">
					<el-tag type="success">{{ rollbackFrom.version }}</el-tag>
				</el-form-item>
				<el-form-item label="回滚到">
					<el-select v-model="rollbackTarget" placeholder="选择要回滚到的 archived 版本" style="width: 100%">
						<el-option
							v-for="v in archivedVersions"
							:key="v.version"
							:label="`${v.version} (archived)`"
							:value="v.version"
						/>
					</el-select>
				</el-form-item>
			</el-form>
			<el-alert type="warning" :closable="false" show-icon class="m-b-10"
				title="回滚将触发关联推理服务的 Deployment rollout，请确认" />
			<template #footer>
				<el-button @click="rollbackVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitRollback">执行回滚</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import * as api from '/@/api/model';
import type { ModelVersion, WarmupItem } from '/@/api/model';
import { bindModelVolume, getModelVolumes, unbindModelVolume, type ModelVolumeItem } from '/@/api/model';
import { getClusterPVCs, type ClusterPVCItem } from '/@/api/cluster';
import PvcWarmupDialog from '/@/components/PvcWarmupDialog.vue';
import { useUserInfo } from '/@/stores/userInfo';
import { useEnvStore } from '/@/stores/env';
import { withContextQuery } from '/@/utils/routeContext';

const route = useRoute();
const router = useRouter();
const name = ref(String(route.params.name || ''));
const envStore = useEnvStore();

const loading = ref(false);
const meta = ref<any>({});
const versions = ref<ModelVersion[]>([]);

const statusTagType = (s: string) =>
	({ staged: 'info', production: 'success', archived: 'warning', deleted: 'danger' } as Record<string, string>)[s] || 'info';

const loadDetail = async () => {
	loading.value = true;
	try {
		const r: any = await api.getModelDetail(name.value);
		meta.value = r?.meta || {};
		versions.value = r?.versions || [];
	} finally {
		loading.value = false;
	}
};

// 新增版本
const addVersionVisible = ref(false);
const submitting = ref(false);
const addFormRef = ref<FormInstance>();
const versionForm = reactive({ version: '', storage_path: '', size_gb: 0 });
const versionRules = {
	version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
	storage_path: [{ required: true, message: '请输入存储路径', trigger: 'blur' }],
};
const openAddVersion = () => {
	Object.assign(versionForm, { version: '', storage_path: '', size_gb: 0 });
	addVersionVisible.value = true;
};
const submitAddVersion = async () => {
	if (!addFormRef.value) return;
	await addFormRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			await api.createModelVersion(name.value, { ...versionForm });
			ElMessage.success('版本已新增（默认 staged）');
			addVersionVisible.value = false;
			loadDetail();
		} finally {
			submitting.value = false;
		}
	});
};

// Promote
const handlePromote = (row: ModelVersion) => {
	ElMessageBox.confirm(`确认将版本 ${row.version} promote 为 production？当前 production 版本将自动归档。`, 'Promote 确认', { type: 'warning' })
		.then(async () => {
			await api.promoteVersion(name.value, row.version, {});
			ElMessage.success('Promote 成功');
			loadDetail();
		})
		.catch(() => {});
};

// Rollback
const rollbackVisible = ref(false);
const rollbackFrom = reactive({ version: '' });
const rollbackTarget = ref('');
const archivedVersions = computed(() => versions.value.filter((v) => v.status === 'archived'));
const openRollback = (row: ModelVersion) => {
	rollbackFrom.version = row.version;
	rollbackTarget.value = archivedVersions.value[0]?.version || '';
	if (!archivedVersions.value.length) {
		ElMessage.warning('没有可回滚的 archived 版本');
		return;
	}
	rollbackVisible.value = true;
};
const submitRollback = async () => {
	if (!rollbackTarget.value) {
		ElMessage.warning('请选择回滚目标版本');
		return;
	}
	submitting.value = true;
	try {
		const r: any = await api.rollbackVersion(name.value, rollbackFrom.version, { target_version: rollbackTarget.value });
		ElMessage.success(`已回滚到 ${r?.rolled_back_to || rollbackTarget.value}，关联推理服务 rollout 进行中`);
		rollbackVisible.value = false;
		loadDetail();
	} finally {
		submitting.value = false;
	}
};

// Archive
const handleArchive = (row: ModelVersion) => {
	ElMessageBox.confirm(`确认归档版本 ${row.version}？归档后不可部署，需人工审批恢复。`, '归档确认', { type: 'warning' })
		.then(async () => {
			await api.archiveVersion(name.value, row.version);
			ElMessage.success('已归档');
			loadDetail();
		})
		.catch(() => {});
};

// 部署：跳推理新建，预填模型
const goDeploy = (row: ModelVersion) => {
	router.push({ path: '/inference/list', query: withContextQuery(route.query, { model: name.value, version: row.version }) });
};

// ---- 权重预热（S3 → PVC 灌数）----
const userInfo = useUserInfo();
const warmupVisible = ref(false);
const warmupVersion = ref('');
const warmupStoragePath = ref('');
const warmups = ref<WarmupItem[]>([]);

const warmupTagType = (s: string) =>
	({ Running: 'warning', Success: 'success', Failed: 'danger' } as Record<string, string>)[s] || 'info';

const openWarmup = (row: ModelVersion) => {
	warmupVersion.value = row.version;
	warmupStoragePath.value = row.storage_path || '';
	warmupVisible.value = true;
};

const loadWarmups = async () => {
	try {
		const r: any = await api.getWarmups({ model: name.value });
		warmups.value = r?.list ?? [];
	} catch {
		warmups.value = [];
	}
};

const handleDeleteWarmup = (row: WarmupItem) => {
	ElMessageBox.confirm(`删除预热记录 ${row.namespace}/${row.pvc_name}（${row.version}）？集群内 Job 将一并清理。`, '删除预热记录', { type: 'warning' })
		.then(async () => {
			await api.deleteWarmup(row.id);
			ElMessage.success('已删除');
			loadWarmups();
		})
		.catch(() => {});
};

onMounted(() => {
	loadDetail();
	loadWarmups();
	loadVolumes();
});

// ---- 模型-存储卷绑定（关联存储卷卡片）----
const volumes = ref<ModelVolumeItem[]>([]);

// 模型目录名（落盘目录默认值，与后端 warmupDestDir / 预热弹窗 destPreview 同口径）
const modelDirName = computed(() => {
	const base = (p?: string) => (p || '').replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';
	return base(meta.value?.cache_nas) || base(meta.value?.local_path) || name.value;
});

const fmtGiB = (bytes?: number) => {
	const n = Number(bytes || 0);
	if (!n) return '—';
	const gi = n / 1024 ** 3;
	return gi >= 1024 ? `${(gi / 1024).toFixed(1)}TiB` : `${gi % 1 === 0 ? gi : gi.toFixed(1)}GiB`;
};

const loadVolumes = async () => {
	try {
		const r: any = await getModelVolumes({ model: name.value });
		volumes.value = r?.list ?? [];
	} catch {
		volumes.value = [];
	}
};

const handleUnbind = (row: ModelVolumeItem) => {
	ElMessageBox.confirm(`解除模型与 ${row.namespace}/${row.pvc_name} 的绑定？集群内卷与其数据不受影响。`, '解绑确认', { type: 'warning' })
		.then(async () => {
			await unbindModelVolume(row.id);
			ElMessage.success('已解绑');
			loadVolumes();
		})
		.catch(() => {});
};

// 新建存储卷并绑定：与集群页/服务侧共用 PvcCreateDialog（模型上下文自动绑定）
const createVolumeVisible = ref(false);
// 命名空间建议：取本环境已有卷的 ns（同环境新建权重盘通常落同一 ns）
const volumeNsOptions = ref<string[]>([]);
const volumeDefaultName = computed(() =>
	`weights-${name.value}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 250)
);
const openCreateVolume = async () => {
	createVolumeVisible.value = true;
	try {
		const res: any = await getClusterPVCs({ size: 200 });
		const list: ClusterPVCItem[] = res?.list ?? [];
		volumeNsOptions.value = [...new Set(list.map((p) => p.namespace))];
	} catch {
		volumeNsOptions.value = [];
	}
};

// 绑定已有存储卷
const bindVisible = ref(false);
const bindSubmitting = ref(false);
const bindPvcLoading = ref(false);
const bindPvcOptions = ref<ClusterPVCItem[]>([]);
const bindForm = reactive({ pvcKey: '', storage_type: 's3' as 's3' | 'nas' });
const openBindExisting = async () => {
	bindForm.pvcKey = '';
	bindVisible.value = true;
	bindPvcLoading.value = true;
	try {
		const res: any = await getClusterPVCs({ size: 200 });
		bindPvcOptions.value = res?.list ?? [];
	} finally {
		bindPvcLoading.value = false;
	}
};
const submitBind = async () => {
	const [namespace, pvcName] = bindForm.pvcKey.split('/');
	if (!namespace || !pvcName) {
		ElMessage.warning('请选择存储卷');
		return;
	}
	bindSubmitting.value = true;
	try {
		await bindModelVolume({ model: name.value, namespace, pvc_name: pvcName, storage_type: bindForm.storage_type });
		ElMessage.success('已绑定');
		bindVisible.value = false;
		loadVolumes();
	} finally {
		bindSubmitting.value = false;
	}
};

// 环境切换联动：模型详情/版本/预热/关联存储卷均属当前环境（后端按 X-ENV-ID 隔离）。
// 切环境后清空旧环境数据并重载，避免停留在上一个环境的模型详情。
watch(
	() => envStore.envId,
	(nv, ov) => {
		if (!nv || nv === ov) return;
		meta.value = {};
		versions.value = [];
		warmups.value = [];
		volumes.value = [];
		loadDetail();
		loadWarmups();
		loadVolumes();
	}
);
</script>

<style scoped lang="scss">
.page-title {
	font-size: 16px;
	font-weight: 600;
}
</style>
