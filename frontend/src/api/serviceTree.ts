import request from './request';

// 服务树 API（平台自建：servicetree_node 表 parent_id 邻接，后端按 X-ENV-ID 环境隔离）
// 树节点结构：{id, key, name, parent, path, level, node_type, principal, children}

// 获取整棵服务树（当前环境）
export function getTree() {
  return request.get('/servicetree/tree');
}

// 模糊搜索节点（名称/全路径）
export function treeNodeLikeFullPath(params: { keyword: string }) {
  return request.get('/servicetree/tree/like-fullpath', { params });
}

// 获取节点关联的资源（占位：资源关联接入后使用）
export function relatedByNodeId(id: number) {
  return request.get(`/servicetree/tree/related/${id}`);
}

// 按路径获取直接子节点
export function getTreeByFullPath(params: { fullpath: string }) {
  return request.get('/servicetree/tree/child', { params });
}

// 新增节点（parent=0 或不传为顶层；node_type 1=服务组 2=叶子节点；叶子节点必须传 server_name，全环境唯一）
export function createTreeNode(
  data: Partial<TreeNode> & { parent: number; node_type: 1 | 2; server_name?: string }
) {
  return request.post('/servicetree/tree', data);
}

// 更新节点（字段级 patch：name / principal / node_type；改名会级联刷新子树 path）
export function updateTreeNode(id: number, data: Partial<TreeNode>) {
  return request.put(`/servicetree/tree/${id}`, data);
}

// 删除节点（级联删除整棵子树）
export function deleteTreeNode(id: number) {
  return request.delete(`/servicetree/tree/${id}`);
}

// 节点数据结构
export interface TreeNode {
  id: number;
  key: string;
  name: string;
  parent: number;
  path: string;
  level: number;
  node_type: 1 | 2; // 1=服务组(文件夹), 2=叶子节点
  server_name?: string; // 叶子节点服务名称，全环境唯一（仅字母/数字/中横线，字母开头）
  inference_count?: number; // 该节点绑定的推理服务数（约定 1 叶子 ↔ 1 推理服务，>1 为历史数据）
  principal?: string; // 负责人
  children?: TreeNode[];
}
