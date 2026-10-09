import request, { getEnvIdHeader } from './request';
import { Session } from '/@/utils/storage';

// ===== 类型定义（对齐 backend/app/cluster/models 与 apis）=====

export interface ClusterNodeItem {
	id: number;
	env_id: number;
	name: string;
	roles: string;
	status: string; // Ready / NotReady / Unknown(平台心跳超时)
	internal_ip: string;
	os_image: string;
	kubelet_version: string;
	labels: string; // 原始 labels JSON 字符串
	pool_id: string; // 池归属（物化视图，由标签求解；空 = 游离节点）
	pool_joined_at: string | null;
	cpu_capacity: number; // 毫核
	cpu_allocatable: number;
	memory_capacity_mi: number;
	memory_allocatable_mi: number;
	pod_capacity: number;
	pod_allocated: number;
	allocated_cpu_milli: number;
	allocated_memory_mi: number;
	gpu_product: string;
	gpu_count: number;
	gpu_memory_gi: number;
	allocated_gpu: number;
	driver_version: string; // label 缺失时为 ''（= 未采集，不等于"兼容"）
	driver_cuda: string;
	update_time: string; // 同步心跳（BaseModel.update_time）
	create_time: string;
}

export interface ClusterPodItem {
	id: number;
	env_id: number;
	namespace: string;
	name: string;
	service_ref: string;
	node_name: string;
	phase: string; // Running / Pending / Succeeded / Failed / Unknown
	restarts: number;
	gpu_request: number;
	cpu_request_milli: number;
	memory_request_mi: number;
	create_time: string; // pod 在 K8s 侧的创建时间（age 用）
	update_time: string;
}

// 与该存储卷关联的模型（model_volume 绑定 / 预热记录派生，非表列）
export interface PVCModelRefItem {
	model_name: string;
	storage_type: string; // nas | s3
	source: string; // bound=手工绑定 / warmup=预热记录
}

// 存储卷（PVC）只读镜像：平台不建/不删/不扩容，仅同步供选择器与引用反查消费
export interface ClusterPVCItem {
	id: number;
	env_id: number;
	namespace: string;
	name: string;
	storage_class: string; // 空 = 走集群默认 StorageClass
	volume_name: string; // 已绑定的 PV 名（Pending 时为空）
	phase: string; // Pending / Bound / Lost
	access_modes: string; // 逗号分隔：RWO/ROX/RWX/RWOP
	volume_mode: string; // Filesystem / Block
	capacity_bytes: number; // 实际容量（字节）
	requested_bytes: number; // 声明容量（字节）
	labels: string; // 原始 labels JSON 字符串
	create_time: string; // PVC 在 K8s 侧的创建时间
	update_time: string; // 同步心跳
	referenced_by?: PVCRefItem[]; // 引用该盘的推理服务（非表列，列表/详情时填充）
	bound_models?: PVCModelRefItem[]; // 与该盘关联的模型（非表列，供模型反查/推理表单过滤）
}

// PVC 引用方（推理服务视角）
export interface PVCRefItem {
	service_name: string;
	namespace: string;
	model: string;
	status: string;
}

// K8s Event 精简行（后端 PodEvents 返回；默认最近 1 小时窗口）
export interface PodEventItem {
	type: string; // Normal / Warning
	reason: string;
	message: string;
	count: number;
	first_timestamp: string;
	last_timestamp: string;
}

export interface ClusterOverview {
	nodes: { total: number; ready: number; not_ready: number; unknown: number };
	cpu: { capacity: number; allocatable: number; allocated: number }; // 毫核
	memory: { capacity: number; allocatable: number; allocated: number }; // Mi
	gpu: {
		total: number;
		allocated: number;
		by_product: { product: string; cards: number; allocated: number; nodes: number }[];
	};
	pods: { total: number; by_phase: Record<string, number> };
}

// ===== 节点池 =====

export interface PoolAgg {
	node_count: number;
	ready_count: number;
	not_ready_count: number;
	gpu_total: number;
	gpu_allocated: number;
	gpu_per_node_max: number; // 单节点最大卡数（准入校验：GPU/副本 不得超过它）
	gpu_products: string[]; // 卡型集合，>1 表示混装
	driver_cuda: string; // 成员最小值；'' = 未采集
	driver_version: string;
	cpu_allocatable_milli: number;
	memory_allocatable_mi: number;
}

export interface ClusterPoolItem {
	id: number;
	env_id: number;
	provider: string; // native / ack / tke
	pool_id: string; // 云侧池 ID（native 为空）
	pool_type: string;
	name: string;
	display_name: string;
	description: string;
	is_default: boolean;
	desired_size: number;
	declared_size: number;
	auto_scaling_enable: boolean;
	min_size: number;
	max_size: number;
	instance_types: string;
	os_image: string;
	managed: boolean;
	deletion_protection: boolean;
	unschedulable: boolean;
	pool_labels: string;
	pool_taints: string;
	remote_state: string;
	remote_initial_nodes: number;
	remote_failed_nodes: number;
	remote_offline_nodes: number;
	synced_at: string | null;
	selector: string; // JSON map：成员判定条件
	tolerations: string; // JSON []
	priority: number;
	// 服务端计算字段
	key: string; // 节点 pool_id 存的值
	source: 'registered' | 'observed'; // observed = 仅从节点标签反推、尚未登记
	mode: 'reference' | 'platform' | 'cloud'; // 创建/归属模式
	agg: PoolAgg;
	create_time: string;
	update_time: string;
}

export interface PoolUpsertPayload {
	name: string;
	display_name?: string;
	description?: string;
	pool_id?: string;
	pool_type?: string;
	selector?: Record<string, string>;
	tolerations?: string[];
	priority?: number;
	declared_size?: number;
}

export interface NodeLabelOption {
	key: string;
	value: string;
	nodes: number;
}

// ===== 接口（X-ENV-ID 由 request 拦截器自动注入）=====

// 资源总览
export const getClusterOverview = () => request.get<ClusterOverview>('/cluster/overview');

// 节点列表（keyword/status/gpu_product/has_gpu 筛选）
export const getClusterNodes = (params?: Record<string, unknown>) => request.get('/cluster/nodes', { params });

// 实例列表（keyword/node_name/phase/service_ref 筛选）
export const getClusterPods = (params?: Record<string, unknown>) => request.get('/cluster/pods', { params });

// 存储卷列表（keyword/namespace/phase/storage_class/access_mode/referenced=1 筛选）
// 每条带 referenced_by：引用该盘的推理服务，用于「删盘前先看谁在用」
export const getClusterPVCs = (params?: Record<string, unknown>) => request.get('/cluster/pvcs', { params });

// 存储卷详情（含引用方反查）
export const getClusterPVC = (namespace: string, name: string) =>
	request.get(`/cluster/pvcs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);

// 存在存储卷的命名空间去重列表（PVC 是 ns 级对象，选择器先按 ns 收窄）
export const getPVCNamespaces = (params?: Record<string, unknown>) => request.get('/cluster/pvc-namespaces', { params });

// StorageClass（集群侧存储类；rwx/rox 为 provisioner 能力标注，供创建表单约束访问模式）
export interface StorageClassItem {
	name: string;
	provisioner: string;
	reclaim_policy: string;
	allow_volume_expansion: boolean;
	volume_binding_mode: string;
	is_default: boolean;
	rwx: boolean;
	rox: boolean;
	capability_known: boolean;
	/** 平台创建（managed-by 标签）：仅此类可删；运维 YAML 定义的只读 */
	platform_created: boolean;
}

export const getStorageClasses = () => request.get('/cluster/storage-classes');

// 存储类管理（仅管理员，错误码 41227-41235）：
// 创建默认 Retain + dry-run 预检；删除三重守卫（平台创建 / 非默认 / 无 PVC 引用）
export interface StorageClassCreatePayload {
	name: string;
	provisioner: string;
	parameters?: Record<string, string>;
	reclaim_policy?: 'Retain' | 'Delete';
	allow_volume_expansion?: boolean;
	volume_binding_mode?: 'Immediate' | 'WaitForFirstConsumer';
	mount_options?: string[];
}

export const createStorageClass = (data: StorageClassCreatePayload) => request.post('/cluster/storage-classes', data);

export const deleteStorageClass = (name: string) => request.delete(`/cluster/storage-classes/${encodeURIComponent(name)}`);

// 受限创建（仅管理员）：同一权威 API 服务于集群页主入口与服务侧「就地新建」
export const createClusterPVC = (data: { namespace: string; name: string; storage_class: string; capacity_gb: number; access_modes: string[] }) =>
	request.post('/cluster/pvcs', data);

// 实例事件（K8s events，后端按 involvedObject 过滤，默认最近 1 小时窗口）
export const getPodEvents = (name: string, params?: { namespace?: string }) =>
	request.get(`/cluster/pods/${encodeURIComponent(name)}/events`, { params });

// 实例重启：删除 Pod 由控制器自动重建（后端失败码 41215）
export const restartPod = (name: string, params?: { namespace?: string }) =>
	request.post(`/cluster/pods/${encodeURIComponent(name)}/restart`, null, { params });

// 构造 Pod 终端 WebSocket 地址：token/env_id 走 query（浏览器 WS API 无法自定义请求头，
// 后端 JWT/Env 中间件对 WS 路由有 query 降级读取）；dev 由 vite 代理转发（ws: true）
export const buildPodTerminalWsUrl = (name: string, params?: { namespace?: string; container?: string }) => {
	const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
	const query = new URLSearchParams();
	query.set('token', Session.get('token') || '');
	const envId = getEnvIdHeader();
	if (envId) query.set('env_id', envId);
	if (params?.namespace) query.set('namespace', params.namespace);
	if (params?.container) query.set('container', params.container);
	return `${proto}://${window.location.host}/api/cluster/pods/${encodeURIComponent(name)}/terminal?${query.toString()}`;
};

// 节点打标（C3）：传期望的完整 labels map，服务端 diff 后下发 K8s
export const patchNodeLabels = (name: string, labels: Record<string, string>) =>
	request.patch(`/cluster/nodes/${name}/labels`, { labels });

// 节点池列表（含 L1 反推的 observed 池与实时聚合）
export const getNodePools = () => request.get('/cluster/nodepools');

// 节点池详情（池元数据 + 成员节点）
export const getNodePool = (key: string) => request.get(`/cluster/nodepools/${encodeURIComponent(key)}`);

// 创建节点池（native：selector 必填；托管：pool_id 必填）
export const createNodePool = (data: PoolUpsertPayload) => request.post('/cluster/nodepools', data);

// 更新节点池（一期支持展示名/描述/selector/tolerations/priority/declared_size）
export const updateNodePool = (key: string, data: Partial<PoolUpsertPayload>) =>
	request.patch(`/cluster/nodepools/${encodeURIComponent(key)}`, data);

// 删除节点池（被推理服务引用时后端返回 41206 硬阻断）
export const deleteNodePool = (key: string) => request.delete(`/cluster/nodepools/${encodeURIComponent(key)}`);

// 节点上真实存在的标签对（创建池时挑选 selector，避免手输 key 打错导致池是空壳）
export const getNodeLabelOptions = () => request.get('/cluster/node-labels');

// ===== 受保护标签前缀（与后端 apis/labels.go 保持一致，禁改禁删）=====
const PROTECTED_LABEL_PREFIXES = [
	'kubernetes.io/',
	'k8s.io/',
	'beta.kubernetes.io/',
	'node.kubernetes.io/',
	'node.beta.kubernetes.io/',
	'node-role.kubernetes.io/',
	'nvidia.com/',
	'aliyun.accelerator/',
	'cloud.tencent.com/',
	'alibabacloud.com/', // ACK 节点池归属（nodepool-id）等云侧元数据
	'ack.aliyun.com',
];

export const isProtectedLabel = (key: string) => PROTECTED_LABEL_PREFIXES.some((p) => key.startsWith(p));
