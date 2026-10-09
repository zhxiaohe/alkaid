import { defineStore } from 'pinia';
import {
	getTree,
	createTreeNode,
	updateTreeNode,
	deleteTreeNode,
	type TreeNode,
} from '/@/api/serviceTree';

// 树形工具：按 id 查节点（树刷新后恢复/校验选中态）
function findNode(nodes: TreeNode[], id: number): TreeNode | null {
	for (const n of nodes) {
		if (n.id === id) return n;
		if (n.children) {
			const hit = findNode(n.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

export const useServiceTreeStore = defineStore('serviceTree', {
	state: () => ({
		treeData: [] as TreeNode[],
		currentNode: null as TreeNode | null,
		loading: false,
	}),
	getters: {
		serviceId: (s) => s.currentNode?.id ?? 0,
		servicePath: (s) => s.currentNode?.path ?? '',
		hasSelected: (s) => !!s.currentNode,
		// 当前选中的必须是叶子节点（node_type=2）才允许查资源
		isLeaf: (s) => s.currentNode?.node_type === 2,
	},
	actions: {
		// 拉取当前环境服务树（后端按 X-ENV-ID 返回该环境数据；请求头由 request 拦截器自动注入）
		async loadTree() {
			this.loading = true;
			try {
				const data = (await getTree()) as unknown as TreeNode[];
				this.treeData = Array.isArray(data) ? data : [];
				// 树刷新后选中节点引用可能已失效（path 变化/被删），按 id 重新同步
				if (this.currentNode) {
					this.currentNode = findNode(this.treeData, this.currentNode.id) ?? null;
				}
			} catch {
				// 错误提示已由请求拦截器统一弹出，这里置空避免残留旧环境数据
				this.treeData = [];
				this.currentNode = null;
			} finally {
				this.loading = false;
			}
		},
		selectNode(node: TreeNode | null) {
			this.currentNode = node;
		},
	// 按 id 从已加载的树中定位并选中（分享链接恢复）；找不到返回 false
	selectById(id: number): boolean {
		const node = findNode(this.treeData, id);
		if (!node) return false;
		this.currentNode = node;
		return true;
	},
	// 按 id 解析节点对象（详情页把 service_tree_id 翻译成节点路径用）；树未加载或找不到返回 null
	nodeById(id: number): TreeNode | null {
		if (!id) return null;
		return findNode(this.treeData, id);
	},
		clear() {
			this.currentNode = null;
		},
		// 新增节点（挂在 parent 下，落库后直接插入返回节点，免整树重拉；parent.id=0 表示顶层）
		async addNode(
			parent: TreeNode,
			data: { name: string; principal?: string; node_type: 1 | 2; server_name?: string }
		) {
			const node = (await createTreeNode({
				name: data.name,
				principal: data.principal || '',
				parent: parent.id,
				node_type: data.node_type,
				...(data.node_type === 2 ? { server_name: data.server_name || '' } : {}),
			})) as unknown as TreeNode;
			if (parent.id === 0) {
				this.treeData.push(node);
			} else {
				parent.children = parent.children || [];
				parent.children.push(node);
			}
			return node;
		},
		// 更新节点（改名会由后端级联刷新子树 path，前端整树重拉保持一致）
		async updateNode(id: number, data: { name?: string; principal?: string }) {
			await updateTreeNode(id, data);
			await this.loadTree();
		},
		// 删除节点（后端级联删除子树，前端整树重拉）
		async deleteNode(id: number) {
			await deleteTreeNode(id);
			await this.loadTree();
		},
	},
});
