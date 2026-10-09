<template>
	<div>
		<el-card shadow="never">
			<template #header>
				<div class="flex-between">
					<span><el-icon><Monitor /></el-icon> 环境管理</span>
					<el-button type="primary" size="small" @click="openDialog()">新增环境</el-button>
				</div>
			</template>
			<el-table :data="list" border stripe v-loading="loading">
				<el-table-column label="颜色" width="70">
					<template #default="{ row }">
						<span class="color-dot" :style="{ background: row.color }"></span>
					</template>
				</el-table-column>
				<el-table-column prop="name" label="名称" width="120" />
				<el-table-column prop="code" label="Code" width="120">
					<template #default="{ row }">
						<el-tag size="small" :type="envTagType(row.code)">{{ row.code }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="cluster_name" label="K8s 集群" min-width="160" />
				<el-table-column label="集群类型" width="120">
					<template #default="{ row }">
						<el-tag size="small" type="info">{{ clusterTypeLabel(row.cluster_type) }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="namespace" label="默认命名空间" width="140" />
				<el-table-column prop="remarks" label="备注" min-width="160" show-overflow-tooltip />
				<el-table-column label="状态" width="90">
					<template #default="{ row }">
						<el-switch v-model="row.status" @change="toggleStatus(row)" />
					</template>
				</el-table-column>
				<el-table-column label="操作" width="160" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
						<el-popconfirm title="确认删除该环境？删除后不可恢复。" @confirm="handleDelete(row)">
							<template #reference>
								<el-button link type="danger" size="small">删除</el-button>
							</template>
						</el-popconfirm>
					</template>
				</el-table-column>
			</el-table>
		</el-card>

		<!-- 新增/编辑 弹窗 -->
		<el-dialog
			v-model="dialogVisible"
			:title="editing ? '编辑环境' : '新增环境'"
			width="560px"
			:close-on-click-modal="false"
		>
			<el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
				<el-form-item label="环境名称" prop="name">
					<el-input v-model="form.name" placeholder="如：开发 / 测试 / 生产" />
				</el-form-item>
				<el-form-item label="环境 Code" prop="code">
					<el-input v-model="form.code" placeholder="如：dev / test / prod" :disabled="editing" />
				</el-form-item>
				<el-form-item label="展示颜色" prop="color">
					<el-color-picker v-model="form.color" show-alpha />
					<span class="color-hint"> 下拉选择器中用于标识该环境</span>
				</el-form-item>
				<el-form-item label="K8s 集群名" prop="cluster_name">
					<el-input v-model="form.cluster_name" placeholder="如：prod-cluster" />
				</el-form-item>
				<el-form-item label="集群类型" prop="cluster_type">
					<el-select v-model="form.cluster_type" placeholder="该环境对应的 K8s 云平台" style="width: 100%">
						<el-option
							v-for="opt in clusterTypeOptions"
							:key="opt.value"
							:label="opt.label"
							:value="opt.value"
						/>
					</el-select>
					<span class="color-hint"> 决定 GPU 供给方案路由（选项在 系统管理-字典配置 中维护）</span>
				</el-form-item>
				<el-form-item label="默认命名空间" prop="namespace">
					<el-input v-model="form.namespace" placeholder="如：ai-prod" />
				</el-form-item>
				<el-form-item label="Kubeconfig">
					<el-input
						v-model="form.kube_config"
						type="textarea"
						:rows="4"
						placeholder="该环境对应集群的 kubeconfig 内容（可选，仅保存不回显）"
					/>
				</el-form-item>
				<el-form-item label="备注">
					<el-input v-model="form.remarks" type="textarea" :rows="2" placeholder="可选" />
				</el-form-item>
				<el-form-item label="启用状态">
					<el-switch v-model="form.status" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="handleSubmit">
					{{ editing ? '保存' : '创建' }}
				</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Monitor } from '@element-plus/icons-vue';
import { getEnvListAll, createEnv, updateEnv, deleteEnv, type EnvItem, type EnvPayload } from '/@/api/env';
import { getDictByCode, type DictEntry } from '/@/api/dict';
import { useEnvStore } from '/@/stores/env';

const envStore = useEnvStore();

const list = ref<EnvItem[]>([]);
const loading = ref(false);
const submitting = ref(false);

// 集群类型选项：以数据字典 env_cluster_type 为权威源（后端校验同源），代码不写死
const clusterTypeOptions = ref<DictEntry[]>([]);
const clusterTypeMap = ref<Record<string, string>>({});
const clusterTypeLabel = (v?: string) =>
	(v ? clusterTypeMap.value[v] : '') || v || 'native';

async function fetchClusterTypes() {
	try {
		const items = (await getDictByCode('env_cluster_type')) as unknown as DictEntry[];
		clusterTypeOptions.value = Array.isArray(items) ? items : [];
		const map: Record<string, string> = {};
		for (const it of clusterTypeOptions.value) map[it.value] = it.label;
		clusterTypeMap.value = map;
	} catch {
		// 字典拉取失败时下拉留空，编辑旧数据仅回显原值
	}
}

// 弹窗表单
const dialogVisible = ref(false);
const editing = ref(false);
const formRef = ref<FormInstance>();
const form = ref<EnvPayload>({
	name: '',
	code: '',
	color: '#52c41a',
	status: true,
	cluster_name: '',
	cluster_type: 'native',
	namespace: '',
	kube_config: '',
	remarks: '',
});

const rules: FormRules = {
	name: [{ required: true, message: '请输入环境名称', trigger: 'blur' }],
	code: [
		{ required: true, message: '请输入环境 Code', trigger: 'blur' },
		{ pattern: /^[a-zA-Z0-9_-]+$/, message: '仅支持英文、数字、下划线、短横线', trigger: 'blur' },
	],
	color: [{ required: true, message: '请选择展示颜色', trigger: 'change' }],
	cluster_name: [{ required: true, message: '请输入 K8s 集群名', trigger: 'blur' }],
};

// 颜色 → el-tag type
const envTagType = (code: string) => {
	if (code === 'prod') return 'danger';
	if (code === 'test') return 'warning';
	if (code === 'dev') return 'success';
	return 'info';
};

// 拉列表（直接走 API，不经过 envStore 的 mock 兜底，避免管理页看不到真实状态）
async function fetchList() {
	loading.value = true;
	try {
		const data = (await getEnvListAll()) as unknown as EnvItem[];
		list.value = Array.isArray(data) ? data : [];
	} catch {
		// 后端不通时，展示 envStore 的数据作为兜底（方便前端 demo）
		list.value = [...envStore.envList];
	} finally {
		loading.value = false;
	}
}

function openDialog(row?: EnvItem) {
	editing.value = !!row;
	if (row) {
		// kube_config 为 write-only，编辑时不回显，需重新填写
		form.value = { ...row, kube_config: '' };
	} else {
		form.value = {
			name: '',
			code: '',
			color: '#52c41a',
			status: true,
			cluster_name: '',
			cluster_type: 'native',
			namespace: '',
			kube_config: '',
			remarks: '',
		};
	}
	dialogVisible.value = true;
}

async function handleSubmit() {
	if (!formRef.value) return;
	await formRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			if (editing.value && form.value.id) {
				await updateEnv(form.value.id, form.value);
				ElMessage.success('更新成功');
			} else {
				await createEnv(form.value);
				ElMessage.success('创建成功');
			}
			dialogVisible.value = false;
			await fetchList();
			// 同步全局 store，顶栏环境下拉自动刷新
			await envStore.loadEnvs();
		} catch (e) {
			// ElMessage 已被拦截器统一处理
		} finally {
			submitting.value = false;
		}
	});
}

async function handleDelete(row: EnvItem) {
	try {
		await deleteEnv(row.id);
		ElMessage.success('删除成功');
		await fetchList();
		// 若删除的是当前选中环境，store 会自动切到第一个
		await envStore.loadEnvs();
	} catch {
		/* 拦截器已处理 */
	}
}

async function toggleStatus(row: EnvItem) {
	try {
		await updateEnv(row.id, { status: row.status });
		ElMessage.success(row.status ? '已启用' : '已禁用');
		await envStore.loadEnvs();
	} catch {
		// 回滚开关状态
		row.status = !row.status;
	}
}

onMounted(() => {
	fetchList();
	fetchClusterTypes();
});
</script>

<style scoped lang="scss">
.flex-between {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.color-dot {
	display: inline-block;
	width: 14px;
	height: 14px;
	border-radius: 50%;
	border: 1px solid rgba(0, 0, 0, 0.1);
}
.color-hint {
	font-size: 12px;
	color: #909399;
	margin-left: 6px;
}
</style>
