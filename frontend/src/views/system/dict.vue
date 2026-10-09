<template>
	<div>
		<el-card shadow="never">
			<template #header>
				<div class="flex-between">
					<span><el-icon><CollectionTag /></el-icon> 字典配置</span>
					<div class="flex-gap">
						<el-input
							v-model="keyword"
							placeholder="搜索字典编码 / 名称"
							clearable
							size="small"
							style="width: 220px"
							@keyup.enter="fetchList"
							@clear="fetchList"
						/>
						<el-button type="primary" size="small" @click="openDictDialog()">新增字典</el-button>
					</div>
				</div>
			</template>
			<el-table
				:data="list"
				border
				stripe
				v-loading="loading"
				highlight-current-row
				:row-class-name="rowClassName"
				@row-click="selectDict"
			>
				<el-table-column prop="code" label="字典编码" width="170">
					<template #default="{ row }">
						<span :class="{ 'dict-code-current': !!current && current.id === row.id }">{{ row.code }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="name" label="字典名称" width="150" />
				<el-table-column prop="type" label="展示类型" width="90">
					<template #default="{ row }">
						<el-tag size="small" :type="typeTagType(row.type)">{{ row.type }}</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
				<el-table-column label="状态" width="80" align="center">
					<template #default="{ row }">
						<el-switch v-model="row.status" @change="toggleStatus(row)" />
					</template>
				</el-table-column>
				<el-table-column label="操作" width="170" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" size="small" @click.stop="openDictDialog(row)">编辑</el-button>
						<el-button link type="primary" size="small" @click.stop="selectDict(row)">查看项</el-button>
						<el-popconfirm title="确认删除该字典？其字典项将一并删除。" @confirm="handleDelete(row)">
							<template #reference>
								<el-button link type="danger" size="small" @click.stop>删除</el-button>
							</template>
						</el-popconfirm>
					</template>
				</el-table-column>
			</el-table>
		</el-card>

		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="flex-between">
					<span>
						字典项
						<template v-if="current">
							<el-tag size="small" type="info" class="m-l-10">{{ current.code }}</el-tag>
							<span class="dict-name">{{ current.name }}</span>
						</template>
						<span v-else class="dict-empty-tip">（点击左侧字典行查看其字典项）</span>
					</span>
					<el-button
						type="primary"
						size="small"
						:disabled="!current"
						@click="openEntryDialog()"
					>新增字典项</el-button>
				</div>
			</template>
			<el-table :data="items" border stripe size="small" v-loading="itemsLoading">
				<el-table-column prop="label" label="显示文本" width="200" />
				<el-table-column prop="value" label="字典值" width="160">
					<template #default="{ row }">
						<span v-if="current?.type === 'color' && row.value.startsWith('#')" class="color-dot" :style="{ background: row.value }"></span>
						{{ row.value }}
					</template>
				</el-table-column>
				<el-table-column prop="sort" label="排序" width="90" align="center" />
				<el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
				<el-table-column label="状态" width="90" align="center">
					<template #default="{ row }">
						<el-switch v-model="row.enabled" @change="toggleEntry(row)" />
					</template>
				</el-table-column>
				<el-table-column label="操作" width="150" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" size="small" @click="openEntryDialog(row)">编辑</el-button>
						<el-popconfirm title="确认删除该字典项？" @confirm="handleDeleteEntry(row)">
							<template #reference>
								<el-button link type="danger" size="small">删除</el-button>
							</template>
						</el-popconfirm>
					</template>
				</el-table-column>
			</el-table>
		</el-card>

		<!-- 字典 新增/编辑 -->
		<el-dialog
			v-model="dictDialogVisible"
			:title="dictEditing ? '编辑字典' : '新增字典'"
			width="520px"
			:close-on-click-modal="false"
		>
			<el-form ref="dictFormRef" :model="dictForm" :rules="dictRules" label-width="90px">
				<el-form-item label="字典编码" prop="code">
					<el-input v-model="dictForm.code" placeholder="如：model_framework" :disabled="dictEditing" />
				</el-form-item>
				<el-form-item label="字典名称" prop="name">
					<el-input v-model="dictForm.name" placeholder="如：推理框架" />
				</el-form-item>
				<el-form-item label="展示类型" prop="type">
					<el-select v-model="dictForm.type" style="width: 100%">
						<el-option label="下拉选择 (select)" value="select" />
						<el-option label="标签 (tag)" value="tag" />
						<el-option label="颜色 (color)" value="color" />
						<el-option label="单选按钮 (radio)" value="radio" />
					</el-select>
				</el-form-item>
				<el-form-item label="备注">
					<el-input v-model="dictForm.remark" type="textarea" :rows="2" placeholder="可选" />
				</el-form-item>
				<el-form-item label="启用状态">
					<el-switch v-model="dictForm.status" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dictDialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="handleDictSubmit">
					{{ dictEditing ? '保存' : '创建' }}
				</el-button>
			</template>
		</el-dialog>

		<!-- 字典项 新增/编辑 -->
		<el-dialog
			v-model="entryDialogVisible"
			:title="entryEditing ? '编辑字典项' : '新增字典项'"
			width="480px"
			:close-on-click-modal="false"
		>
			<el-form ref="entryFormRef" :model="entryForm" :rules="entryRules" label-width="90px">
				<el-form-item label="显示文本" prop="label">
					<el-input v-model="entryForm.label" placeholder="如：vLLM" />
				</el-form-item>
				<el-form-item label="字典值" prop="value">
					<el-input v-model="entryForm.value" placeholder="如：vLLM（存储值）" />
				</el-form-item>
				<el-form-item label="排序" prop="sort">
					<el-input-number v-model="entryForm.sort" :min="0" :max="999" />
				</el-form-item>
				<el-form-item label="备注">
					<el-input v-model="entryForm.remark" type="textarea" :rows="2" placeholder="可选" />
				</el-form-item>
				<el-form-item label="启用状态">
					<el-switch v-model="entryForm.enabled" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="entryDialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="handleEntrySubmit">
					{{ entryEditing ? '保存' : '创建' }}
				</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { CollectionTag } from '@element-plus/icons-vue';
import {
	getDictList,
	getDictDetail,
	createDict,
	updateDict,
	deleteDict,
	createDictEntry,
	updateDictEntry,
	deleteDictEntry,
	type DictItem,
	type DictDetail,
	type DictEntry,
	type DictPayload,
	type DictEntryPayload,
} from '/@/api/dict';

const list = ref<DictItem[]>([]);
const loading = ref(false);
const items = ref<DictEntry[]>([]);
const itemsLoading = ref(false);
const keyword = ref('');
const submitting = ref(false);

const current = ref<DictItem | null>(null);

const typeTagType = (t: string) => (t === 'color' ? 'danger' : t === 'tag' ? 'warning' : t === 'radio' ? 'success' : 'info');
const rowClassName = ({ row }: { row: DictItem }) =>
	current.value?.id === row.id ? 'dict-row-current' : '';

async function fetchList() {
	loading.value = true;
	try {
		list.value = (await getDictList(keyword.value.trim())) as unknown as DictItem[];
	} catch {
		/* 拦截器已处理 */
	} finally {
		loading.value = false;
	}
}

async function selectDict(row: DictItem) {
	current.value = row;
	await fetchItems(row.id);
}

async function fetchItems(dictId: number) {
	itemsLoading.value = true;
	try {
		const detail = (await getDictDetail(dictId)) as unknown as DictDetail;
		items.value = detail?.items || [];
		// 列表中的 name/remark/type 可能被更新，回写当前行
		if (detail?.dict) {
			const idx = list.value.findIndex((d) => d.id === dictId);
			if (idx >= 0) list.value[idx] = { ...list.value[idx], ...detail.dict };
			if (current.value?.id === dictId) current.value = detail.dict;
		}
	} catch {
		/* 拦截器已处理 */
	} finally {
		itemsLoading.value = false;
	}
}

// ----- 字典 弹窗 -----
const dictDialogVisible = ref(false);
const dictEditing = ref(false);
const dictFormRef = ref<FormInstance>();
const dictForm = ref<DictPayload>({});
const dictRules: FormRules = {
	code: [
		{ required: true, message: '请输入字典编码', trigger: 'blur' },
		{ pattern: /^[a-zA-Z0-9_]+$/, message: '仅支持英文、数字、下划线', trigger: 'blur' },
	],
	name: [{ required: true, message: '请输入字典名称', trigger: 'blur' }],
};

function openDictDialog(row?: DictItem) {
	dictEditing.value = !!row;
	if (row) {
		dictForm.value = { code: row.code, name: row.name, remark: row.remark, status: row.status, type: row.type };
	} else {
		dictForm.value = { code: '', name: '', remark: '', status: true, type: 'select' };
	}
	dictDialogVisible.value = true;
}

async function handleDictSubmit() {
	if (!dictFormRef.value) return;
	await dictFormRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			if (dictEditing.value && current.value) {
				await updateDict(current.value.id, dictForm.value);
				ElMessage.success('更新成功');
			} else {
				const res = (await createDict(dictForm.value)) as { id?: number };
				ElMessage.success('创建成功');
				if (res?.id) {
					const created = res as { id: number };
					current.value = { ...(dictForm.value as DictItem), id: created.id };
				}
			}
			dictDialogVisible.value = false;
			await fetchList();
			if (current.value?.id) await fetchItems(current.value.id);
		} catch {
			/* 拦截器已处理 */
		} finally {
			submitting.value = false;
		}
	});
}

async function handleDelete(row: DictItem) {
	try {
		await deleteDict(row.id);
		ElMessage.success('删除成功');
		if (current.value?.id === row.id) {
			current.value = null;
			items.value = [];
		}
		await fetchList();
	} catch {
		/* 拦截器已处理 */
	}
}

async function toggleStatus(row: DictItem) {
	try {
		await updateDict(row.id, { status: row.status });
		ElMessage.success(row.status ? '已启用' : '已禁用');
	} catch {
		row.status = !row.status;
	}
}

// ----- 字典项 弹窗 -----
const entryDialogVisible = ref(false);
const entryEditing = ref(false);
const entryFormRef = ref<FormInstance>();
const entryForm = ref<DictEntryPayload>({});
const entryRules: FormRules = {
	label: [{ required: true, message: '请输入显示文本', trigger: 'blur' }],
	value: [{ required: true, message: '请输入字典值', trigger: 'blur' }],
};

function openEntryDialog(row?: DictEntry) {
	if (!current.value) return;
	entryEditingId.value = row?.id ?? null;
	entryEditing.value = !!row;
	if (row) {
		entryForm.value = { label: row.label, value: row.value, sort: row.sort, remark: row.remark, enabled: row.enabled };
	} else {
		const maxSort = items.value.reduce((m, i) => Math.max(m, i.sort || 0), 0);
		entryForm.value = { label: '', value: '', sort: maxSort + 1, remark: '', enabled: true };
	}
	entryDialogVisible.value = true;
}

async function handleEntrySubmit() {
	if (!entryFormRef.value || !current.value) return;
	await entryFormRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			if (entryEditing.value && entryEditingId.value) {
				await updateDictEntry(current.value!.id, entryEditingId.value, entryForm.value);
				ElMessage.success('更新成功');
			} else {
				await createDictEntry(current.value!.id, entryForm.value);
				ElMessage.success('创建成功');
			}
			entryDialogVisible.value = false;
			await fetchItems(current.value!.id);
		} catch {
			/* 拦截器已处理 */
		} finally {
			submitting.value = false;
		}
	});
}

const entryEditingId = ref<number | null>(null);

async function handleDeleteEntry(row: DictEntry) {
	if (!current.value) return;
	try {
		await deleteDictEntry(current.value.id, row.id);
		ElMessage.success('删除成功');
		await fetchItems(current.value.id);
	} catch {
		/* 拦截器已处理 */
	}
}

async function toggleEntry(row: DictEntry) {
	if (!current.value) return;
	try {
		await updateDictEntry(current.value.id, row.id, { enabled: row.enabled });
		ElMessage.success(row.enabled ? '已启用' : '已禁用');
	} catch {
		row.enabled = !row.enabled;
	}
}

onMounted(async () => {
	await fetchList();
	// 默认选中第一个字典，右侧面板直接可用
	if (list.value.length && current.value == null) {
		selectDict(list.value[0]);
	}
});
</script>

<style scoped lang="scss">
.flex-between {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.flex-gap {
	display: flex;
	align-items: center;
	gap: 10px;
}
.dict-code-current {
	color: var(--el-color-primary);
	font-weight: 600;
}
:deep(.el-table__row) {
	cursor: pointer;
}
:deep(.dict-row-current td) {
	background-color: var(--el-color-primary-light-9) !important;
}
.dict-name {
	margin-left: 10px;
	font-size: 13px;
	color: #606266;
}
.dict-empty-tip {
	font-size: 13px;
	color: #909399;
	margin-left: 10px;
}
.color-dot {
	display: inline-block;
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 1px solid rgba(0, 0, 0, 0.1);
	margin-right: 6px;
	vertical-align: -1px;
}
</style>