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
	// 数据面监听端口。留空/0 = 用默认 80。必须与集群里 higress-gateway Service
	// 暴露的端口一致，否则 Gateway 会卡在 Programmed=False（入口地址为空）。
	listen_port?: number;
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
	env_id?: number; // 后端列（环境隔离用），列表行会返回；前端只在调试时用到
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

// ── M4.3 下发链路（渲染 → SSA 下发 → 状态回读 → 显式回收）──────────────────────
//
// 一处必须记住的语义：**下发是按环境聚合的**。集群里 Higress 的 Gateway 实例是
// 环境级物理单例，所以 `POST /gateway/:name/apply` 的 :name 只用来确定
// 「哪个环境 + 哪个驱动」，实际收敛的是该环境该驱动下的**全部**网关记录。
// 因此界面上的「下发」按钮放在任意一条记录上，效果对整个环境的入口生效——
// 响应里的 records / skipped 就是用来把这条聚合边界摊开给用户看的。

// 一个经网关对外暴露的服务（每服务一个路径前缀，见后端 render 注释的实测结论）
export interface GatewayServiceEntry {
	name: string;
	namespace: string;
	port: number;
	path_prefix: string; // /svc/<服务名>
	base_url: string; // /svc/<服务名>/v1 —— OpenAI SDK 的 base_url 就填这个
	entry_url?: string; // 完整可访问地址（回读到入口地址时才有）
}

// 未参与本次收敛的记录及原因（未指定驱动的旧记录 / 另一驱动的记录）
export interface GatewaySkipped {
	name: string;
	reason: string;
}

// GET /gateway/gateway-api/available：集群是否具备 Gateway API standard CRD（能否下发的硬前置）
export interface GatewayApiAvailable {
	available: boolean;
	reason?: string;
	// 平台实际连接的 API Server 地址（best-effort）：多集群环境下排"连错集群"的第一手证据
	cluster_host?: string;
	gateway?: string;
	gateway_namespace?: string;
	route_name?: string;
	path_prefix_base?: string;
}

// GET /gateway/:name/manifest：只渲染不下发（下发前预览，也可用于与集群实际做 diff）
export interface GatewayManifest {
	env_code: string;
	driver: GatewayProvider;
	gateway: string;
	gateway_namespace: string;
	route_name: string;
	records: string[];
	skipped: GatewaySkipped[];
	service_count: number;
	services: GatewayServiceEntry[];
	route_namespaces: string[];
	listen_port: number; // 本次产物实际使用的数据面监听端口（留空 → 平台默认 80）
	yaml: string;
}

// 下发/回收的共同响应形状（回收只填一部分字段）
export interface GatewayDispatchResult {
	applied?: boolean;
	teardown?: boolean;
	env_code: string;
	driver: GatewayProvider;
	gateway: string;
	gateway_namespace: string;
	listen_port?: number; // 环境级单例的数据面监听端口（0/缺省 → 平台默认 80）
	trigger?: string;
	records: string[];
	skipped?: GatewaySkipped[];
	service_count?: number;
	services?: GatewayServiceEntry[];
	route_namespaces?: string[];
	dispatched?: string[];
	pruned?: string[] | null;
	endpoint?: string;
	status?: string;
	detail?: string;
	renderer_version?: string;
}

// GET /gateway/:name/state：回读运行态（只读，不做纠偏写入）
export interface GatewayStateResult {
	env_code: string;
	driver: GatewayProvider;
	gateway: string;
	gateway_namespace: string;
	trigger: string;
	records: string[];
	status: string;
	endpoint: string;
	detail: string;
	models?: string[];
	keys?: string[];
	drift?: string[];
	service_count: number;
	services: GatewayServiceEntry[];
	route_namespaces: string[];
}

export const getGatewayApiAvailable = (envId?: number): Promise<GatewayApiAvailable> =>
	request.get('/gateway/gateway-api/available', { params: envId ? { env_id: envId } : undefined });

// 只渲染不下发：产物预览（不写 resolved_spec——那一列的语义是"最近一次已下发的快照"）
export const previewGatewayManifest = (name: string): Promise<GatewayManifest> => request.get(`/gateway/${name}/manifest`);

// 下发（幂等）。force=true 接管被其他 manager 占用的字段（首次迁移 / 字段所有权冲突救援）
export const applyGateway = (name: string, force = false): Promise<GatewayDispatchResult> =>
	request.post(`/gateway/${name}/apply`, { force });

// 回读状态（服务端同时把状态与错误摘要落库，列表页据此显示）
export const getGatewayState = (name: string): Promise<GatewayStateResult> => request.get(`/gateway/${name}/state`);

// 显式回收集群入口。与「删除记录」严格区分：删记录只动库不动集群（可复活），
// 只有本接口会真删集群对象——用于"删掉记录却在集群里留着入口"的清理
export const teardownGateway = (name: string): Promise<GatewayDispatchResult> => request.post(`/gateway/${name}/teardown`);
