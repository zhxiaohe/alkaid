<template>
	<!-- 控制台模式专用：展示当前服务节点的基础信息（完整路径 / 负责人 / 环境），不承载交互 -->
	<div class="ctx-bar">
		<template v-if="treeStore.hasSelected">
			<el-icon class="ctx-icon" :size="14"><Connection /></el-icon>
			<span class="ctx-label">服务树节点</span>
			<span class="ctx-path" :title="treeStore.servicePath">{{ treeStore.servicePath }}</span>
			<el-tag v-if="treeStore.currentNode?.principal" size="small" effect="plain" class="ctx-principal">
				负责人 {{ treeStore.currentNode.principal }}
			</el-tag>
			<el-tag v-if="!treeStore.isLeaf" size="small" effect="plain" type="warning" class="ctx-tag">服务组</el-tag>
			<span class="ctx-flex"></span>
		</template>
		<template v-else>
			<el-icon class="ctx-icon" :size="14"><Connection /></el-icon>
			<span class="ctx-empty">未选择服务节点 —— 点击上方路径旁的服务选择器，列表将按节点过滤</span>
		</template>
	</div>
</template>

<script setup lang="ts">
import { Connection } from '@element-plus/icons-vue';
import { useServiceTreeStore } from '/@/stores/serviceTree';

const treeStore = useServiceTreeStore();
</script>

<style scoped lang="scss">
.ctx-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 32px;
	padding: 0 15px;
	background: var(--card-bg);
	border-bottom: 1px solid var(--line-soft);
	font-size: 12px;
	color: var(--ink-mid);
	overflow: hidden;
	white-space: nowrap;
	.ctx-icon { color: var(--brand); flex-shrink: 0; }
	.ctx-label { color: var(--ink-low); flex-shrink: 0; }
	.ctx-path {
		font-family: var(--font-mono);
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 46%;
	}
	.ctx-principal { flex-shrink: 0; }
	.ctx-tag { flex-shrink: 0; }
	.ctx-flex { flex: 1; }
	.ctx-empty { color: var(--ink-low); }
}
</style>
