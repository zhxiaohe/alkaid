<template>
	<div>
		<el-alert
			v-if="!treeStore.hasSelected"
			title="请先在左侧服务树选择一个服务节点（叶子节点），再查看训练任务列表"
			type="info"
			:closable="false"
			show-icon
			class="m-b-15"
		/>
		<div class="flex-between m-b-15">
			<el-input v-model="keyword" placeholder="搜索任务名" style="width: 240px" clearable @keyup.enter="loadList" />
			<el-button type="primary" :icon="Plus" :disabled="!treeStore.hasSelected" @click="openCreate">新建训练任务</el-button>
		</div>
		<el-table :data="paginator.list" border stripe v-loading="loading" @row-click="goDetail">
			<el-table-column prop="name" label="任务名" min-width="160" />
			<el-table-column prop="base_model" label="基座模型" min-width="140" />
			<el-table-column prop="method" label="微调方法" width="100" />
			<el-table-column prop="dataset" label="数据集" min-width="160" show-overflow-tooltip />
			<el-table-column prop="gpu_count" label="GPU 数" width="90" align="center" />
			<el-table-column label="状态" width="110" align="center">
				<template #default="{ row }">
					<el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
				</template>
			</el-table-column>
			<el-table-column label="MLflow" width="100" align="center">
				<template #default="{ row }">
					<el-button v-if="row.mlflow_run_id" link type="primary" @click.stop="goDetail(row)">查看</el-button>
					<span v-else>—</span>
				</template>
			</el-table-column>
			<el-table-column label="操作" width="220" fixed="right">
				<template #default="{ row }">
					<el-button link type="primary" @click.stop="goDetail(row)">日志</el-button>
					<el-button v-if="['Running', 'Pending'].includes(row.status)" link type="warning" @click.stop="handleStop(row)">停止</el-button>
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

		<!-- 新建训练任务 -->
		<el-dialog v-model="createVisible" title="新建训练任务" width="640px" :close-on-click-modal="false">
			<el-form ref="createFormRef" :model="form" :rules="rules" label-width="110px">
				<el-form-item label="任务名" prop="name">
					<el-input v-model="form.name" placeholder="如 train-qwen2.5-20260903" />
				</el-form-item>
				<el-form-item label="基座模型" prop="base_model">
					<el-input v-model="form.base_model" placeholder="如 Qwen2.5-7B" />
				</el-form-item>
				<el-form-item label="微调方法" prop="method">
					<el-select v-model="form.method" style="width: 100%">
						<el-option v-for="opt in methodOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
					</el-select>
				</el-form-item>
				<el-form-item label="数据集" prop="dataset">
					<el-input v-model="form.dataset" placeholder="如 customer_sft_202609" />
				</el-form-item>
				<el-form-item label="GPU 数" prop="gpu_count">
					<el-input-number v-model="form.gpu_count" :min="1" :max="64" />
				</el-form-item>
				<el-form-item label="GPU 类型" prop="gpu_type">
					<el-select v-model="form.gpu_type" style="width: 100%">
						<el-option v-for="opt in gpuOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
					</el-select>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="createVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitCreate">提交训练</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import * as api from '/@/api/training';
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

const statusType = (s: string) =>
	({ Succeeded: 'success', Failed: 'danger', Running: 'warning', Pending: 'info', Stopped: 'info' } as Record<string, string>)[s] || 'info';

const loadList = async () => {
	if (!treeStore.hasSelected) {
		paginator.list = [];
		paginator.total = 0;
		return;
	}
	loading.value = true;
	try {
		const r = await api.getTrainingList({
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
// 环境切换联动：训练任务按环境隔离（后端 env_id = ?）。未选服务节点时
// serviceId 恒为 0，上面的监听不触发，需单独监听环境，避免切环境后不刷新。
watch(() => envStore.envId, () => {
	paginator.page = 1;
	loadList();
});

const goDetail = (row: any) => router.push({ path: `/training/detail/${encodeURIComponent(row.name)}`, query: withContextQuery(route.query) });

// 新建
const createVisible = ref(false);
const submitting = ref(false);
const createFormRef = ref<FormInstance>();

// 字典下拉（微调方法 / GPU 类型，与字典管理联动）
const methodOptions = ref<DictEntry[]>([]);
const gpuOptions = ref<DictEntry[]>([]);
getDictOptions('train_method').then((d) => (methodOptions.value = d));
getDictOptions('gpu_type').then((d) => (gpuOptions.value = d));

const form = reactive({
	name: '', base_model: '', method: 'lora', dataset: '', gpu_count: 8, gpu_type: 'A100-80G',
});
const rules = {
	name: [{ required: true, message: '请输入任务名', trigger: 'blur' }],
	base_model: [{ required: true, message: '请输入基座模型', trigger: 'blur' }],
	method: [{ required: true, message: '请选择微调方法', trigger: 'change' }],
	dataset: [{ required: true, message: '请输入数据集', trigger: 'blur' }],
};
const openCreate = () => {
	Object.assign(form, { name: '', base_model: '', method: 'lora', dataset: '', gpu_count: 8, gpu_type: 'A100-80G' });
	createVisible.value = true;
};
const submitCreate = async () => {
	if (!createFormRef.value) return;
	await createFormRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			await api.createTraining({ ...form, service_tree_id: treeStore.serviceId });
			ElMessage.success('训练任务已提交');
			createVisible.value = false;
			loadList();
		} finally {
			submitting.value = false;
		}
	});
};

const handleStop = (row: any) => {
	ElMessageBox.confirm(`确认停止训练任务 ${row.name}？`, '提示', { type: 'warning' })
		.then(async () => {
			await api.stopTraining(row.name);
			ElMessage.success('停止已提交');
			loadList();
		})
		.catch(() => {});
};
const handleDelete = (row: any) => {
	ElMessageBox.confirm(`确认删除训练任务 ${row.name}？`, '提示', { type: 'warning' })
		.then(async () => {
			await api.deleteTraining(row.name);
			ElMessage.success('删除已提交');
			loadList();
		})
		.catch(() => {});
};

onMounted(loadList);
</script>
