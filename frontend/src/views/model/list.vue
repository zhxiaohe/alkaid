<template>
	<div>
		<el-alert
			v-if="!treeStore.hasSelected"
			title="未选择服务节点：默认展示公共基座模型；选择服务后可同时查看该服务私有微调版本"
			type="info"
			:closable="false"
			show-icon
			class="m-b-15"
		/>
		<div class="flex-between m-b-15">
			<el-input v-model="keyword" placeholder="搜索模型名" style="width: 240px" clearable @keyup.enter="loadList" />
			<el-button type="primary" :icon="Plus" @click="openImport">录入模型</el-button>
		</div>
		<el-table :data="paginator.list" border stripe v-loading="loading" @row-click="goDetail">
			<el-table-column prop="name" label="模型名" min-width="160" />
			<el-table-column prop="latest_version" label="最新版本" width="110" />
			<el-table-column prop="framework" label="框架" width="120" />
			<el-table-column label="大小" width="100">
				<template #default="{ row }">{{ row.size_gb }} GB</template>
			</el-table-column>
			<el-table-column label="归属" width="100" align="center">
				<template #default="{ row }">
					<el-tag v-if="row.service_tree_id" size="small" type="warning">私有</el-tag>
					<el-tag v-else size="small" type="info">公共</el-tag>
				</template>
			</el-table-column>
			<el-table-column label="存储路径" min-width="200" show-overflow-tooltip>
				<template #default="{ row }">{{ row.storage_path || row.local_path || '—' }}</template>
			</el-table-column>
			<el-table-column prop="created_at" label="录入时间" width="170" />
			<el-table-column label="操作" width="220" fixed="right">
				<template #default="{ row }">
					<el-button link type="primary" @click.stop="goDetail(row)">版本</el-button>
					<el-button link type="primary" @click.stop="goDeploy(row)">部署</el-button>
					<el-button link type="danger" @click.stop="handleDelete(row)">删除</el-button>
				</template>
			</el-table-column>
		</el-table>
		<el-pagination
			class="m-t-15"
			background
			layout="total, sizes, prev, pager, next, jumper"
			:page-size="paginator.size"
			:current-page="paginator.page"
			:total="paginator.total"
			:page-sizes="[10, 20, 50, 100]"
			@size-change="(sz) => { paginator.size = sz; paginator.page = 1; loadList() }"
			@current-change="(p) => { paginator.page = p; loadList() }"
		/>

		<!-- 录入模型 -->
		<el-dialog v-model="importVisible" title="录入模型" width="600px" :close-on-click-modal="false">
			<el-alert type="info" :closable="false" show-icon class="m-b-15"
				title="三种来源：S3 路径 / 上传权重 / 训练产物。新模型首个版本默认 staged 状态。" />
			<el-form ref="importFormRef" :model="form" :rules="rules" label-width="110px">
				<el-form-item label="模型名" prop="name">
					<el-input v-model="form.name" placeholder="如 Qwen2.5-7B-SFT" />
				</el-form-item>
				<el-form-item label="基座" prop="base">
					<el-input v-model="form.base" placeholder="如 qwen2" />
				</el-form-item>
				<el-form-item label="参数量" prop="params">
					<el-input v-model="form.params" placeholder="如 7B" />
				</el-form-item>
				<el-form-item label="首个版本号" prop="latest_version">
					<el-input v-model="form.latest_version" placeholder="如 v1.0" />
				</el-form-item>
				<el-form-item label="框架" prop="framework">
					<el-select v-model="form.framework" placeholder="选择或输入框架" style="width: 100%" allow-create filterable>
						<el-option v-for="opt in frameworkOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
					</el-select>
				</el-form-item>
				<el-form-item label="大小(GB)">
					<el-input-number v-model="form.size_gb" :min="0" :step="0.1" :precision="1" />
				</el-form-item>
				<el-form-item label="S3 路径" prop="storage_path">
					<el-input v-model="form.storage_path" placeholder="s3://bucket-name/模型名/" />
					<div class="form-tip">S3 原件（分发/归档源）；Pod 不能直接挂 S3，部署前需同步到 NAS/本地</div>
				</el-form-item>
				<el-form-item label="NAS 缓存">
					<el-input v-model="form.cache_nas" placeholder="/nas/models/模型名/" />
					<div class="form-tip">NAS 副本的模型目录；推理部署时按 {模型目录}/{版本}/ 目录约定挂载</div>
				</el-form-item>
				<el-form-item label="本地路径" prop="local_path">
					<el-input v-model="form.local_path" placeholder="/data/models/模型名/" />
					<div class="form-tip">离线/单机部署时填本地磁盘的模型目录；与 S3 路径至少填一个，推理 hostPath 挂载默认取该目录的父级</div>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="importVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitImport">录入</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import * as api from '/@/api/model';
import { getDictOptions, type DictEntry } from '/@/api/dict';
import { useServiceTreeStore } from '/@/stores/serviceTree';
import { useEnvStore } from '/@/stores/env';
import { withContextQuery } from '/@/utils/routeContext';

const router = useRouter();
const route = useRoute();
const treeStore = useServiceTreeStore();
const envStore = useEnvStore();
const keyword = ref('');
const loading = ref(false);
const paginator = reactive({ total: 0, list: [] as any[], page: 1, size: 20, total_page: 0 });

const loadList = async () => {
	loading.value = true;
	try {
		const r = await api.getModelList({
			keyword: keyword.value,
			page: paginator.page,
			size: paginator.size,
			service_id: treeStore.serviceId,
		});
		Object.assign(paginator, r);
	} finally {
		loading.value = false;
	}
};
watch(() => treeStore.serviceId, () => {
	paginator.page = 1;
	loadList();
});
// 环境切换联动：模型列表按环境隔离（后端 env_id = 0 OR env_id = ?）。
// 未选服务节点时 serviceId 恒为 0，上面的 serviceId 监听不会触发，必须单独监听环境，
// 否则切环境后仍停留在上一个环境的模型列表。
watch(() => envStore.envId, () => {
	paginator.page = 1;
	loadList();
});

const goDetail = (row: any) => router.push({ path: `/model/detail/${encodeURIComponent(row.name)}`, query: withContextQuery(route.query) });
const goDeploy = (row: any) => router.push({ path: '/inference/list', query: withContextQuery(route.query, { model: row.name }) });

// 录入
const importVisible = ref(false);
const submitting = ref(false);
const importFormRef = ref<FormInstance>();

// 框架下拉（与字典管理联动，允许自定义输入）
const frameworkOptions = ref<DictEntry[]>([]);
getDictOptions('model_framework').then((d) => (frameworkOptions.value = d));

const form = reactive({
	name: '', base: '', params: '', latest_version: 'v1.0', framework: 'transformers',
	size_gb: 0, storage_path: '', cache_nas: '', local_path: '',
});
// S3 路径与本地路径至少填其一（校验挂在 storage_path 上，local_path 输入时清除提示）
const requireOnePath = (_rule: unknown, _value: unknown, callback: (err?: Error) => void) => {
	if (!form.storage_path && !form.local_path) callback(new Error('S3 路径与本地路径至少填写一项'));
	else callback();
};
const rules = {
	name: [{ required: true, message: '请输入模型名', trigger: 'blur' }],
	base: [{ required: true, message: '请输入基座', trigger: 'blur' }],
	latest_version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
	storage_path: [{ validator: requireOnePath, trigger: 'blur' }],
};
watch(() => form.local_path, () => importFormRef.value?.clearValidate('storage_path'));
const openImport = () => {
	Object.assign(form, { name: '', base: '', params: '', latest_version: 'v1.0', framework: 'transformers', size_gb: 0, storage_path: '', cache_nas: '', local_path: '' });
	importVisible.value = true;
};
const submitImport = async () => {
	if (!importFormRef.value) return;
	await importFormRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			await api.createModel({ ...form, service_tree_id: treeStore.serviceId });
			ElMessage.success('模型已录入（首个版本 staged）');
			importVisible.value = false;
			loadList();
		} finally {
			submitting.value = false;
		}
	});
};

const handleDelete = (row: any) => {
	ElMessageBox.confirm(`确认删除模型 ${row.name}（含所有版本）？`, '提示', { type: 'warning' })
		.then(async () => {
			await api.deleteModel(row.name);
			ElMessage.success('删除已提交');
			loadList();
		})
		.catch(() => {});
};

onMounted(loadList);
</script>

<style scoped lang="scss">
.form-tip {
	margin-top: 4px;
	font-size: 12px;
	line-height: 1.6;
	color: var(--ink-low, #909399);
}
</style>
