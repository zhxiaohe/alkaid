<template>
	<div class="service-tree">
		<div class="tree-header">
			<span class="title">服务树</span>
		</div>
		<el-input
			v-model="filterText"
			class="tree-search"
			placeholder="搜索节点"
			clearable
			size="small"
			:prefix-icon="Search"
		/>
		<div class="tree-body" v-loading="treeStore.loading">
			<el-tree
				ref="treeRef"
				:data="treeStore.treeData"
				node-key="id"
				:props="defaultProps"
				highlight-current
				:filter-node-method="filterNode"
				:expand-on-click-node="false"
				:default-expanded-keys="defaultExpandedKeys"
				@current-change="handleCurrentChange"
			>
				<template #default="{ node, data }">
					<span class="custom-tree-node">
						<el-icon v-if="data.node_type === 2" class="node-icon leaf"><Document /></el-icon>
						<el-icon v-else class="node-icon folder"><Folder /></el-icon>
						<span class="node-label" :title="data.path">{{ data.key }}</span>
						<!-- 已绑推理服务数：1 叶子节点 ↔ 1 推理服务；>1 说明存在历史脏数据，用警示色提示 -->
						<span
							v-if="data.node_type === 2 && data.inference_count"
							class="bind-badge"
							:class="{ over: data.inference_count > 1 }"
							:title="data.inference_count > 1 ? `已绑 ${data.inference_count} 个推理服务（超出 1:1 约定，属历史数据）` : '已绑定 1 个推理服务'"
						>{{ data.inference_count }}</span>
					</span>
				</template>
			</el-tree>
		</div>
		<div v-if="treeStore.hasSelected" class="tree-footer">
			<el-tooltip :content="treeStore.servicePath" placement="top">
				<span class="current-path">{{ treeStore.servicePath }}</span>
			</el-tooltip>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { Search, Document, Folder } from '@element-plus/icons-vue';
import { ElTree } from 'element-plus';
import { useServiceTreeStore } from '/@/stores/serviceTree';
import type { TreeNode } from '/@/api/serviceTree';

const treeStore = useServiceTreeStore();
const treeRef = ref<InstanceType<typeof ElTree>>();
const filterText = ref('');

const defaultProps = { children: 'children', label: 'key' };

// 默认展开第一层 + 第二层（首屏不全部折叠）
const defaultExpandedKeys = computed(() => {
	const keys: number[] = [];
	treeStore.treeData.forEach((n) => {
		keys.push(n.id);
		n.children?.forEach((c) => keys.push(c.id));
	});
	return keys;
});

const filterNode = (value: string, data: TreeNode) => {
	if (!value) return true;
	return (data.key + data.name + data.path).toLowerCase().includes(value.toLowerCase());
};

watch(filterText, (val) => {
	treeRef.value?.filter(val);
});

const handleCurrentChange = (data: TreeNode) => {
	treeStore.selectNode(data);
};

onMounted(() => {
	if (!treeStore.treeData.length) {
		treeStore.loadTree();
	}
});
</script>

<style scoped lang="scss">
.service-tree {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: #fff;
}
.tree-header {
	height: 36px;
	line-height: 36px;
	padding: 0 12px;
	border-bottom: 1px solid #eee;
	display: flex;
	align-items: center;
	justify-content: space-between;
	.title {
		font-weight: 600;
		font-size: 13px;
		color: #303133;
	}
}
.tree-search {
	margin: 8px 8px 0;
	width: calc(100% - 16px);
}
.tree-body {
	flex: 1;
	overflow: auto;
	padding: 4px 8px;
	margin-top: 4px;
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
		&.folder { color: #e6a23c; }
		&.leaf { color: #409eff; }
	}
	.node-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bind-badge {
		margin-left: auto;
		flex-shrink: 0;
		min-width: 14px;
		height: 14px;
		line-height: 14px;
		padding: 0 4px;
		border-radius: 7px;
		background: #409eff;
		color: #fff;
		font-size: 10px;
		text-align: center;
		&.over {
			background: #e6a23c; // >1 违反 1:1 约定，警示色
		}
	}
}
.tree-footer {
	padding: 8px 12px;
	border-top: 1px solid #eee;
	background: #f5f7fa;
	.current-path {
		font-size: 11px;
		color: #909399;
		display: inline-block;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}
</style>
