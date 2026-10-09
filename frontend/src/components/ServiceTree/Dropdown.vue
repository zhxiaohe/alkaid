<template>
	<el-popover
		placement="bottom-start"
		:width="380"
		trigger="click"
		popper-class="service-tree-dropdown-popper"
		:persistent="false"
	>
		<template #reference>
			<div class="tree-trigger" :class="{ 'has-value': treeStore.hasSelected }">
				<el-icon class="tree-trigger-icon"><Connection /></el-icon>
				<span class="tree-trigger-text" :title="treeStore.hasSelected ? treeStore.servicePath : ''">
					{{ treeStore.hasSelected ? shortPath : '选择服务' }}
				</span>
				<el-icon class="tree-trigger-arrow"><ArrowDown /></el-icon>
			</div>
		</template>
		<div class="service-tree-dropdown">
			<!-- 搜索 + 新增顶级节点 -->
			<div class="tree-search-row">
				<el-input
					v-model="filterText"
					class="tree-search"
					placeholder="搜索节点"
					clearable
					size="small"
					:prefix-icon="Search"
				/>
				<el-tooltip content="新增顶级节点" placement="top">
					<el-button class="tree-add-root" :icon="Plus" circle size="small" @click="openAdd(ROOT_NODE)" />
				</el-tooltip>
			</div>
			<!-- 树 -->
			<div class="tree-body" v-loading="treeStore.loading" :element-loading-background="'rgba(255,255,255,0.6)'">
				<el-tree
					ref="treeRef"
					:data="treeStore.treeData"
					node-key="id"
					:props="defaultProps"
					highlight-current
					:current-node-key="treeStore.serviceId || undefined"
					:filter-node-method="filterNode"
					:expand-on-click-node="false"
					:default-expanded-keys="defaultExpandedKeys"
					@node-click="handleNodeClick"
					@node-contextmenu="handleContextMenu"
				>
					<template #default="{ node, data }">
						<span class="custom-tree-node">
							<el-icon v-if="data.node_type === 2" class="node-icon leaf"><Document /></el-icon>
							<el-icon v-else class="node-icon folder"><Folder /></el-icon>
							<span class="node-label" :title="data.path">{{ data.key }}</span>
							<span v-if="canManage(data)" class="node-actions" @click.stop>
								<!-- 叶子节点(2)下不能再挂子节点：隐藏新增入口 -->
								<el-tooltip v-if="data.node_type !== 2" content="新增子节点" placement="top">
									<el-icon class="action-btn" @click="openAdd(data)"><Plus /></el-icon>
								</el-tooltip>
								<el-tooltip content="编辑" placement="top">
									<el-icon class="action-btn" @click="openEdit(data)"><Edit /></el-icon>
								</el-tooltip>
								<el-tooltip content="删除" placement="top">
									<el-icon class="action-btn danger" @click="confirmDelete(data)"><Delete /></el-icon>
								</el-tooltip>
							</span>
						</span>
					</template>
				</el-tree>
				<div class="tree-empty" v-if="!treeStore.treeData.length && !treeStore.loading">暂无服务数据</div>
			</div>
			<!-- 当前选中 -->
			<div class="tree-footer">
				<template v-if="treeStore.hasSelected">
					<el-tooltip :content="treeStore.servicePath" placement="top">
						<span class="current-path">{{ treeStore.servicePath }}</span>
					</el-tooltip>
					<span v-if="treeStore.currentNode?.principal" class="principal-tag">
						负责人 {{ treeStore.currentNode.principal }}
					</span>
				</template>
				<span v-else class="current-path muted">请选择服务节点（业务列表将按节点过滤）</span>
			</div>
		</div>
	</el-popover>

	<!-- 新增节点 -->
	<el-dialog v-model="addVisible" title="新增节点" width="440px" :close-on-click-modal="false">
		<el-form :model="addForm" label-width="70px">
			<el-form-item label="名称" required>
				<el-input v-model="addForm.name" placeholder="节点名称" />
			</el-form-item>
			<el-form-item label="类型">
				<div class="node-type-field">
					<el-radio-group v-model="addForm.nodeType">
						<el-radio :label="1">服务组</el-radio>
						<el-radio :label="2" :disabled="addParent?.id === 0">叶子节点</el-radio>
					</el-radio-group>
					<span v-if="addParent?.id === 0" class="node-type-tip">顶层节点固定为服务组</span>
				</div>
			</el-form-item>
			<el-form-item v-if="addForm.nodeType === 2" label="服务名" required>
				<el-input v-model="addForm.serverName" placeholder="如：order-service（全环境唯一）" maxlength="64" />
				<div class="server-name-tip">仅支持英文、数字与中横线，且需以字母开头</div>
			</el-form-item>
			<el-form-item label="负责人">
				<el-input v-model="addForm.principal" placeholder="负责人用户名" />
			</el-form-item>
			<el-form-item label="上级" v-if="addParent">
				<el-input :model-value="addParent.path" disabled />
			</el-form-item>
		</el-form>
		<template #footer>
			<el-button @click="addVisible = false">取消</el-button>
			<el-button type="primary" :loading="submitting" @click="confirmAdd">确定</el-button>
		</template>
	</el-dialog>

	<!-- 编辑节点 -->
	<el-dialog v-model="editVisible" title="编辑节点" width="440px" :close-on-click-modal="false">
		<el-form :model="editForm" label-width="70px">
			<el-form-item label="名称" required>
				<el-input v-model="editForm.name" placeholder="节点名称" />
			</el-form-item>
			<el-form-item label="负责人">
				<el-input v-model="editForm.principal" placeholder="负责人用户名" />
			</el-form-item>
			<el-form-item label="当前路径" v-if="editingNode">
				<el-input :model-value="editingNode.path" disabled />
			</el-form-item>
		</el-form>
		<template #footer>
			<el-button @click="editVisible = false">取消</el-button>
			<el-button type="primary" :loading="submitting" @click="confirmEdit">确定</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, Document, Folder, Plus, Edit, Delete, Connection, ArrowDown } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useServiceTreeStore } from '/@/stores/serviceTree';
import { useUserInfo } from '/@/stores/userInfo';
import { useEnvStore } from '/@/stores/env';
import type { TreeNode } from '/@/api/serviceTree';

const treeStore = useServiceTreeStore();
const userInfo = useUserInfo();
const envStore = useEnvStore();
const route = useRoute();
const router = useRouter();

const treeRef = ref();
const filterText = ref('');
const defaultProps = { children: 'children', label: 'key' };

// 虚拟根节点：用于“新增顶级节点”（后端 parent=0 即顶层）
const ROOT_NODE = { id: 0, key: '', name: '', parent: -1, path: '顶级节点', level: 0, node_type: 1 } as TreeNode;

// 服务名称（server_name）：全环境唯一；仅英文/数字/中横线，字母开头，<64 字符
const SERVER_NAME_REGEX = /^[A-Za-z][A-Za-z0-9-]*$/;

// 当前有权限(admin)或作为负责人时，展示该节点的增删改
const canManage = (node: TreeNode) => {
	return userInfo.isAdmin || (!!node.principal && node.principal === userInfo.userName);
};

// 触发器短路径：超过 3 段时首尾截断（center/…/c3），完整路径看 title 与下方信息条
const shortPath = computed(() => {
	const p = treeStore.servicePath;
	if (!p) return '';
	const parts = p.split('/').filter(Boolean);
	if (parts.length <= 3) return parts.join('/');
	return `${parts[0]}/…/${parts[parts.length - 1]}`;
});

const defaultExpandedKeys = computed(() => {
	const keys: number[] = [];
	treeStore.treeData.forEach((n) => {
		keys.push(n.id);
		n.children?.forEach((c) => keys.push(c.id));
	});
	return keys;
});

const filterNode = (value: string, data: TreeNode, _node?: unknown) => {
	if (!value) return true;
	return (data.key + data.name + data.path).toLowerCase().includes(value.toLowerCase());
};

watch(filterText, (val) => {
	treeRef.value?.filter(val);
});

// 点击节点（含已当前选中的叶子再次点击）：仅叶子节点写入 URL（env 已由环境切换逻辑维护），方便复制/分享直达当前服务
const handleNodeClick = (data: TreeNode) => {
	treeStore.selectNode(data);
	// 展开祖先节点，保证层级较深的服务选中/恢复时可见（el-tree 无 setExpanded，改走 getNode().expanded）
	ancestorIds(treeStore.treeData, data.id).forEach((id) => {
		const n = treeRef.value?.getNode(id);
		if (n) n.expanded = true;
	});
	treeRef.value?.setCurrentKey(data.id);
	if (data.node_type === 2) {
		const query: Record<string, string | number> = { ...route.query } as Record<string, string | number>;
		if (envStore.envId) query.envid = envStore.envId;
		query.service_id = data.id;
		router.replace({ query });
	}
};

// 收集 target 的全部祖先 id（自顶向下），用于展开节点使其可见
function ancestorIds(nodes: TreeNode[], targetId: number): number[] {
	const walk = (list: TreeNode[], chain: number[]): number[] | null => {
		for (const n of list) {
			if (n.id === targetId) return chain;
			if (n.children) {
				const r = walk(n.children, [...chain, n.id]);
				if (r) return r;
			}
		}
		return null;
	};
	return walk(nodes, []) || [];
}

// ---------- 右键新增 ----------
const handleContextMenu = (event: MouseEvent, data: TreeNode) => {
	// 仅服务组可右键快速新增；叶子节点/无权限不拦截默认菜单
	if (!canManage(data) || data.node_type === 2) return;
	event.preventDefault();
	openAdd(data);
};

// ---------- CRUD ----------
const submitting = ref(false);

// add
const addVisible = ref(false);
const addParent = ref<TreeNode | null>(null);
const addForm = ref<{ name: string; principal: string; nodeType: 1 | 2; serverName: string }>({
	name: '',
	principal: '',
	nodeType: 1,
	serverName: '',
});

// edit
const editVisible = ref(false);
const editingNode = ref<TreeNode | null>(null);
const editForm = ref<{ name: string; principal: string }>({ name: '', principal: '' });

const openAdd = (parent: TreeNode) => {
	// 叶子节点下不允许再新增（入口已隐藏，这里兜底）
	if (parent.id !== 0 && parent.node_type === 2) {
		ElMessage.warning('叶子节点下不能新增子节点');
		return;
	}
	addParent.value = parent;
	// 顶层固定服务组(1)；其余默认叶子(2)，可在弹窗切换为服务组(1)
	addForm.value = {
		name: '',
		principal: userInfo.userName,
		nodeType: parent.id === 0 ? 1 : 2,
		serverName: '',
	};
	addVisible.value = true;
};

const openEdit = (node: TreeNode) => {
	editingNode.value = node;
	editForm.value = { name: node.name, principal: node.principal || '' };
	editVisible.value = true;
};

const confirmAdd = async () => {
	if (!addForm.value.name.trim()) {
		ElMessage.warning('请输入节点名称');
		return;
	}
	if (addForm.value.nodeType === 2) {
		const serverName = addForm.value.serverName.trim();
		if (!serverName) {
			ElMessage.warning('叶子节点请输入服务名称');
			return;
		}
		if (!SERVER_NAME_REGEX.test(serverName)) {
			ElMessage.warning('服务名称仅支持英文、数字与中横线，且需以字母开头');
			return;
		}
	}
	if (!addParent.value) return;
	submitting.value = true;
	try {
		await treeStore.addNode(addParent.value, {
			name: addForm.value.name.trim(),
			principal: addForm.value.principal.trim(),
			node_type: addForm.value.nodeType,
			server_name: addForm.value.serverName.trim(),
		});
		ElMessage.success('新增成功');
		addVisible.value = false;
	} catch {
		/* 后端错误已由请求拦截器统一提示 */
	} finally {
		submitting.value = false;
	}
};

const confirmEdit = async () => {
	if (!editingNode.value) return;
	if (!editForm.value.name.trim()) {
		ElMessage.warning('请输入节点名称');
		return;
	}
	submitting.value = true;
	try {
		await treeStore.updateNode(editingNode.value.id, {
			name: editForm.value.name.trim(),
			principal: editForm.value.principal.trim(),
		});
		ElMessage.success('更新成功');
		editVisible.value = false;
	} catch {
		/* 后端错误已由请求拦截器统一提示 */
	} finally {
		submitting.value = false;
	}
};

const confirmDelete = async (node: TreeNode) => {
	await ElMessageBox.confirm(
		`确定删除节点「${node.name}」？其子节点将级联删除，此操作不可恢复。`,
		'删除确认',
		{ type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
	);
	try {
		await treeStore.deleteNode(node.id);
		ElMessage.success('删除成功');
	} catch {
		/* 后端错误已由请求拦截器统一提示 */
	}
};

onMounted(() => {
	if (!treeStore.treeData.length) {
		treeStore.loadTree();
	}
});
</script>

<style scoped lang="scss">
.node-type-field {
	display: flex;
	align-items: center;
	gap: 10px;
	.node-type-tip {
		font-size: 12px;
		color: var(--ink-low);
	}
}
.server-name-tip {
	font-size: 12px;
	color: var(--ink-low);
	line-height: 1.4;
	width: 100%;
}
.tree-trigger {
	display: flex;
	align-items: center;
	gap: 6px;
	cursor: pointer;
	padding: 4px 10px;
	border: 1px solid var(--line);
	border-radius: 4px;
	font-size: 13px;
	color: var(--ink-low);
	transition: all 0.2s;
	max-width: 240px;
	.tree-trigger-icon { flex-shrink: 0; }
	.tree-trigger-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.tree-trigger-arrow { font-size: 11px; flex-shrink: 0; }
	&:hover { border-color: var(--brand); color: var(--brand); }
	&.has-value { color: var(--ink); border-color: var(--line); }
}
.service-tree-dropdown {
	display: flex;
	flex-direction: column;
	height: 360px;
	.tree-search-row {
		display: flex;
		gap: 6px;
		margin-bottom: 8px;
	}
	.tree-search { flex: 1; }
	.tree-body {
		flex: 1;
		overflow: auto;
		.tree-empty {
			text-align: center; color: var(--ink-low); padding: 40px; font-size: 13px;
		}
	}
	.tree-footer {
		margin-top: 8px;
		padding: 8px 10px;
		border-top: 1px solid var(--line-soft);
		background: var(--hover-bg);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		.current-path {
			font-size: 12px;
			color: var(--ink);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			display: block;
			max-width: 100%;
			&.muted { color: var(--ink-low); }
		}
		.principal-tag {
			font-size: 11px;
			color: var(--ink-low);
		}
	}
}
.custom-tree-node {
	flex: 1;
	display: flex;
	align-items: center;
	font-size: 13px;
	overflow: hidden;
	.node-icon {
		margin-right: 4px;
		flex-shrink: 0;
		&.folder { color: var(--warn); }
		&.leaf { color: var(--brand); }
	}
	.node-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.node-actions {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: 6px;
		visibility: hidden;
		.action-btn {
			cursor: pointer;
			font-size: 14px;
			padding: 2px;
			&:hover { color: var(--brand); }
			&.danger:hover { color: var(--danger); }
		}
	}
}
:deep(.el-tree-node__content:hover) .node-actions {
	visibility: visible;
}
</style>
