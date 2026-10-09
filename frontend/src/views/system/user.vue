<template>
	<div>
		<el-card shadow="never">
			<template #header>
				<div class="flex-between">
					<span><el-icon><User /></el-icon> 用户管理</span>
					<div class="flex-gap">
						<el-input
							v-model="keyword"
							placeholder="搜索用户名 / 姓名 / 邮箱"
							clearable
							size="small"
							style="width: 230px"
							@keyup.enter="fetchList(1)"
							@clear="fetchList(1)"
						/>
						<el-button type="primary" size="small" @click="openDialog()">新增用户</el-button>
					</div>
				</div>
			</template>
			<el-table :data="list" border stripe v-loading="loading">
				<el-table-column prop="username" label="用户名" width="140">
					<template #default="{ row }">
						<span>{{ row.username }}</span>
						<el-tag v-if="row.roles.split(',').includes('admin')" size="small" type="danger" class="m-l-6">管理员</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="nickname" label="姓名" width="120" />
				<el-table-column prop="roles" label="角色" width="150">
					<template #default="{ row }">
						<el-tag v-for="r in row.roles.split(',')" :key="r" size="small" :type="r === 'admin' ? 'danger' : 'info'" class="m-r-4">
							{{ r }}
						</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="email" label="邮箱" width="200" show-overflow-tooltip />
				<el-table-column prop="mobile" label="手机号" width="140" />
				<el-table-column label="状态" width="90" align="center">
					<template #default="{ row }">
						<el-switch v-model="row.status" :disabled="row.username === 'admin'" @change="toggleStatus(row)" />
					</template>
				</el-table-column>
				<el-table-column prop="created_at" label="创建时间" width="170">
					<template #default="{ row }">{{ (row.created_at || '').slice(0, 10) }}</template>
				</el-table-column>
				<el-table-column label="操作" width="200" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" size="small" @click="openDialog(row, 'edit')">编辑</el-button>
						<el-button link type="warning" size="small" @click="openDialog(row, 'pwd')">重置密码</el-button>
						<el-popconfirm title="确认删除该用户？" @confirm="handleDelete(row)">
							<template #reference>
								<el-button link type="danger" size="small" :disabled="row.username === 'admin'">删除</el-button>
							</template>
						</el-popconfirm>
					</template>
				</el-table-column>
			</el-table>
			<div class="pager">
				<el-pagination
					v-model:current-page="page"
					v-model:page-size="size"
					:total="total"
					layout="total, prev, pager, next"
					background
					@current-change="fetchList()"
				/>
			</div>
		</el-card>

		<el-dialog
			v-model="dialogVisible"
			:title="dialogTitle"
			width="520px"
			:close-on-click-modal="false"
		>
			<el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
				<el-form-item label="用户名" prop="username">
					<el-input v-model="form.username" placeholder="登录账号，如 zhangsan" :disabled="!!editingUser" />
				</el-form-item>
				<template v-if="mode === 'create' || mode === 'pwd'">
					<el-form-item :label="mode === 'pwd' ? '新密码' : '初始密码'" prop="password">
						<el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
					</el-form-item>
				</template>
				<el-form-item label="姓名">
					<el-input v-model="form.nickname" placeholder="显示名，如 张三" />
				</el-form-item>
				<el-form-item label="邮箱">
					<el-input v-model="form.email" placeholder="如 zhangsan@ai.local" />
				</el-form-item>
				<el-form-item label="手机号">
					<el-input v-model="form.mobile" placeholder="选填" />
				</el-form-item>
				<el-form-item label="角色">
					<el-select v-model="form.rolesText" multiple style="width: 100%" :disabled="editingUser?.username === 'admin'">
						<el-option v-for="r in roleOptions" :key="r" :label="r" :value="r" />
					</el-select>
				</el-form-item>
				<el-form-item label="备注">
					<el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" />
				</el-form-item>
				<el-form-item v-if="mode !== 'pwd'" label="启用状态">
					<el-switch v-model="form.status" :disabled="editingUser?.username === 'admin'" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="handleSubmit">
					{{ mode === 'pwd' ? '重置密码' : '保存' }}
				</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { User } from '@element-plus/icons-vue';
import { getUserList, getUserRoles, createUser, updateUser, deleteUser, type SysUser, type UserPayload } from '/@/api/user';

const list = ref<SysUser[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const keyword = ref('');
const loading = ref(false);
const submitting = ref(false);

const roleOptions = ref<string[]>(['admin', 'user']);

const dialogVisible = ref(false);
const mode = ref<'create' | 'edit' | 'pwd'>('create');
const editingUser = ref<SysUser | null>(null);
const formRef = ref<FormInstance>();
const form = ref<UserPayload & { rolesText: string[] }>({
	username: '', nickname: '', email: '', mobile: '', rolesText: ['user'], status: true, remark: '', password: '',
});

const dialogTitle = computed(() =>
	mode.value === 'create' ? '新增用户' : mode.value === 'pwd' ? `重置密码 - ${editingUser.value?.username}` : '编辑用户'
);

const rules: FormRules = {
	username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
	password:
		mode.value === 'pwd'
			? [{ required: true, message: '请输入新密码', trigger: 'blur' }]
			: [
					{ required: true, message: '请输入初始密码', trigger: 'blur' },
					{ min: 6, message: '至少 6 位', trigger: 'blur' },
				],
};

async function fetchRoles() {
	try {
		roleOptions.value = ((await getUserRoles()) as unknown as string[]) || ['admin', 'user'];
	} catch {
		/* 拦截器已处理 */
	}
}

async function fetchList(p?: number) {
	if (p) page.value = p;
	loading.value = true;
	try {
		const r = (await getUserList({ keyword: keyword.value.trim(), page: page.value, size: size.value })) as unknown as {
			list: SysUser[];
			total: number;
		};
		list.value = r?.list || [];
		total.value = r?.total || 0;
	} catch {
		// 鉴权失败/后端不通时不回退 mock，保持真实空态
		list.value = [];
		total.value = 0;
	} finally {
		loading.value = false;
	}
}

function openDialog(row?: SysUser, m: 'create' | 'edit' | 'pwd' = 'create') {
	mode.value = m;
	editingUser.value = row || null;
	form.value = {
		username: row?.username || '',
		nickname: row?.nickname || '',
		email: row?.email || '',
		mobile: row?.mobile || '',
		rolesText: row ? row.roles.split(',').filter(Boolean) : ['user'],
		status: row ? row.status : true,
		remark: row?.remark || '',
		password: '',
	};
	dialogVisible.value = true;
}

async function handleSubmit() {
	if (!formRef.value) return;
	await formRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			const payload: UserPayload = {
				nickname: form.value.nickname,
				email: form.value.email,
				mobile: form.value.mobile,
				roles: form.value.rolesText.join(','),
				remark: form.value.remark,
			};
			if (mode.value === 'create' || mode.value === 'pwd') payload.password = form.value.password;
			if (mode.value !== 'pwd') payload.status = form.value.status;

			if (editingUser.value && mode.value !== 'create') {
				await updateUser(editingUser.value.id, payload);
				ElMessage.success(mode.value === 'pwd' ? '密码已重置' : '更新成功');
			} else {
				await createUser({ ...payload, username: form.value.username });
				ElMessage.success('创建成功');
			}
			dialogVisible.value = false;
			await fetchList();
		} catch {
			/* 拦截器已处理 */
		} finally {
			submitting.value = false;
		}
	});
}

async function toggleStatus(row: SysUser) {
	try {
		await updateUser(row.id, { status: row.status });
		ElMessage.success(row.status ? '已启用' : '已禁用');
	} catch {
		row.status = !row.status;
	}
}

async function handleDelete(row: SysUser) {
	try {
		await deleteUser(row.id);
		ElMessage.success('删除成功');
		await fetchList();
	} catch {
		/* 拦截器已处理 */
	}
}

onMounted(async () => {
	await fetchRoles();
	await fetchList(1);
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
.pager {
	margin-top: 14px;
	display: flex;
	justify-content: flex-end;
}
.m-l-6 {
	margin-left: 6px;
}
.m-r-4 {
	margin-right: 4px;
}
</style>