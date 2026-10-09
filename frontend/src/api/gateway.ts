import request from './request';

// 网关类型：ai=AI 网关（Higress InferencePool，KV-cache 感知路由）；traffic=流量网关（HTTPRoute/Ingress）
export type GatewayType = 'ai' | 'traffic';

// 接入驱动：一个集群一种（设计 §3.1）。后端 models.ProviderHigress / ProviderLiteLLM
export type GatewayProvider = 'higress' | 'litellm';
// LiteLLM 下发通道：declarative（config.yaml 为源，需 reload）| api（写 Postgres，动态生效）
// 由 LiteLLM 自身 store_model_in_db 开关决定，创建后不可改（变更 = 新建实例）
export type DispatchMode = 'declarative' | 'api';

// 能力矩阵一项：前端字段显隐的唯一依据（报错为"支持"会导致静默失效）
export interface GatewayCapability {
	key: string;
	supported: boolean;
	note?: string;
	pending?: boolean;
}

// 驱动探测结论（GET /gateway/providers/available）
export interface ProviderInfo {
	name: GatewayProvider;
	available: boolean;
	version?: string;
	reason?: string;
	install_hint?: string;
	capabilities: GatewayCapability[];
}

export interface ProvidersAvailable {
	providers: ProviderInfo[];
	ai_gateway_count: number;
	ai_slot_available: boolean;
}

// ── 网关 spec：公共信封 + provider 专属段（与后端 models.GatewaySpec 同构）──────
export interface APIKeySpec {
	name: string;
	service?: string;
	expires_at?: string;
}

export interface ModelRoute {
	name: string;
	service: string;
	weight?: number;
	fallback?: string;
}

export interface SplitBackend {
	service: string;
	weight: number;
}

export interface TrafficSplit {
	model: string;
	backends: SplitBackend[];
}

export interface RateLimit {
	rpm?: number;
	tpm?: number;
	scope?: 'consumer' | 'global';
}

export interface HigressSpec {
	domain?: string;
	tls_secret?: string;
	model_routes?: ModelRoute[];
	traffic_split?: TrafficSplit[];
	rate_limit?: RateLimit;
}

export interface ModelDef {
	name: string;
	service: string;
}

export interface KeyLimits {
	rpm?: number;
	tpm?: number;
}

export interface LiteLLMSpec {
	dispatch_mode: DispatchMode;
	model_list?: ModelDef[];
	key_limits?: KeyLimits;
	fallback_chain?: string[];
}

export interface GatewaySpec {
	common: {
		namespace: string;
		api_keys?: APIKeySpec[];
		linked_services?: string[];
	};
	higress?: HigressSpec;
	litellm?: LiteLLMSpec;
}

export interface GatewayItem {
	name: string;
	type: GatewayType;
	domain: string;
	status: string;
	// AI 网关字段
	model?: string;
	inference_services?: string[];
	routing_policy?: string; // kv-cache / round-robin / weighted
	// 流量网关字段
	paths?: { path: string; backend: string; weight?: number }[];
	// 公共字段
	namespace: string;
	service_tree_id: number;
	created_at: string;
	// M4 网关下发字段
	provider?: GatewayProvider; // 空 = 一期旧记录（未指定驱动，不自动迁移）
	// 注意：**响应侧 spec 是 JSON 字符串**（后端列类型为 string，与 inference 同构）。
	// 需要对象时用 parseGatewaySpec() 解析，不要把 row.spec 直接当对象用。
	spec?: string;
	resolved_spec?: string; // 渲染产物快照（只读）
	renderer_version?: string;
	endpoint?: string;
	dispatched_at?: string;
	last_error?: string;
}

// 创建/更新的请求体：spec 这一侧才是对象（后端 createRequest.Spec 按对象解析）
export interface GatewayCreatePayload {
	type: GatewayType;
	name?: string;
	domain?: string;
	service_tree_id?: number;
	namespace?: string;
	provider?: GatewayProvider;
	spec?: GatewaySpec;
	paths?: { path: string; backend: string; weight?: number }[];
}

// spec 字符串 → 对象（列表行 / 详情都是字符串）。解析失败返回 null，调用方按"未配置"处理，
// 不让一条脏数据把整列渲染打崩（与 inference 的 parseJSONMap 同范式）。
export const parseGatewaySpec = (raw?: string): GatewaySpec | null => {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as GatewaySpec) : null;
	} catch {
		return null;
	}
};

// 网关列表（type 不传=全部，ai/traffic 过滤）
export const getGatewayList = (params?: { type?: GatewayType; keyword?: string; page?: number; size?: number; service_id?: number }) =>
	request.get('/gateway/list', { params });

// 网关详情
export const getGatewayDetail = (name: string) => request.get(`/gateway/${name}`);

// 服务视角反查：引用了指定推理服务的 AI 网关（含归一化的模型路由视图，不分页）。
// 服务详情「网关配置」抽屉的数据源；后端对非管理员校验该服务树节点负责人是本人
export const listGatewaysForService = (service: string) =>
	request.get('/gateway/list', { params: { for_service: service } });

// 创建网关
export const createGateway = (data: GatewayCreatePayload) => request.post('/gateway', data);

// 更新网关（一期仅 AI 网关：spec 整体替换，provider/name/type 不可变）
export const updateGateway = (name: string, data: GatewayCreatePayload) => request.put(`/gateway/${name}`, data);

// 删除网关
export const deleteGateway = (name: string) => request.delete(`/gateway/${name}`);

// 驱动探测：该环境可用驱动 + 能力矩阵 + 安装/配置指引（前端驱动选择与字段显隐的唯一来源）
export const getProvidersAvailable = (envId?: number) =>
	request.get('/gateway/providers/available', { params: envId ? { env_id: envId } : undefined });
