<template>
	<div class="selectable-tree" v-loading="loading">
		<el-input v-model="keyword" placeholder="搜索服务" size="small" clearable class="m-b-10" @keyup.enter="filter" />
		<el-tree
			ref="treeRef"
			:data="treeStore.treeData"
			node-key="id"
			:props="defaultProps"
			:filter-node-method="filterNode"
			:expand-on-click-node="false"
			highlight-current
			@node-click="handleSelect"
		>
			<template #default="{ data }">
				<span class="node-label">
					<el-icon v-if="data.node_type === 2" color="#409eff"><Document /></el-icon>
					<el-icon v-else color="#606266"><Folder /></el-icon>
					<span class="m-l-5">{{ data.key }}</span>
				</span>
			</template>
		</el-tree>
		<div class="tree-empty" v-if="!treeStore.treeData.length && !loading">暂无服务数据</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { Document, Folder } from '@element-plus/icons-vue';
import { useServiceTreeStore } from '/@/stores/serviceTree';

const emit = defineEmits<{ (e: 'select'): void }>();

const treeStore = useServiceTreeStore();
const loading = ref(false);
const keyword = ref('');
const treeRef = ref();

const defaultProps = { children: 'children', label: 'key' };

const filter = () => treeRef.value?.filter(keyword.value);
const filterNode = (v: string, data: any) => !v || data.key.includes(v) || data.name?.includes(v);

const handleSelect = (data: any) => {
	if (data.node_type !== 2) return; // 只允许选叶子节点
	treeStore.selectNode(data);
	emit('select');
};

watch(() => keyword.value, filter);

onMounted(async () => {
	loading.value = true;
	try { await treeStore.loadTree(); } finally { loading.value = false; }
});
</script>

<style scoped lang="scss">
.selectable-tree {
	max-height: 400px;
	overflow-y: auto;
	.node-label { font-size: 13px; }
	.tree-empty { text-align: center; color: #909399; padding: 40px; font-size: 13px; }
}
</style>
