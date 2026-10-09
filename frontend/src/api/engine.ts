import request from './request';

// 推理引擎镜像注册表（对齐后端 engine_image / EngineImageDTO）
//
// 字段命名说明（后端刻意错位，见 backend/app/engine/models/engine_image.go）：
//   engine     = 展示名（vLLM / SGLang），模板沿用旧 EngineRow 字段
//   engine_key = 落库标识（vllm / sglang），提交 spec.engine 用它
//   schema     = param_schema 的键（vllm / sglang），仅作标识

export type ParamFieldType = 'select' | 'number' | 'switch' | 'text';

// 参数表单契约（原 views/inference/engine-registry.ts 的 ParamField 迁移至此）
export interface ParamField {
	key: string;
	label: string; // 展示名，含 CLI flag
	flag: string; // CLI flag，黑名单与冲突检测用
	type: ParamFieldType;
	options?: string[];
	min?: number;
	max?: number;
	step?: number;
	tip?: string;
	placeholder?: string;
	clearable?: boolean;
	cross_max?: string; // 值不得大于该 key 对应字段（如 batched tokens ≤ 上下文长度）
	advanced?: boolean;
}

export interface EngineImage {
	id: number;
	platform: string; // linux/amd64/nvidia
	engine: string; // 展示名：vLLM / SGLang
	engine_key: string; // 落库标识：vllm / sglang
	schema: string; // param schema 键
	version: string;
	display: string; // 平台/引擎完整坐标：linux/amd64/nvidia/vllm:0.9.2
	image: string;
	cuda_requirement: string; // 镜像自带 CUDA runtime
	default_port: number;
	param_schema: ParamField[];
	default_params: Record<string, unknown>;

	// ── 启动契约（对齐后端 EngineImageDTO，来源 backend/app/engine/models/launch.go）──
	// command 空数组 = 使用镜像自带 ENTRYPOINT；非空 = 平台显式指定的 entrypoint。
	// 后端返回的是**生效值**（已含引擎内置兜底），前端展示直接用即可。
	command: string[];
	model_flag: string; // 权重路径 flag：--model | --model-path
	tp_flag: string; // 并行度 flag：--tensor-parallel-size | --tp
	command_configured: boolean; // false = 该行尚未声明 command（仍在走内置兜底），管理页据此提示

	status: boolean; // 启用=可选；下架=不可新建（存量服务照常渲染/重启）
	sort: number;
	remark?: string;
}

// 启动契约的三种状态（与后端 launch.go 的三态一一对应，前端不得自行合并）：
//   default  不传 command 字段 → 后端按引擎内置默认补齐（SGLang 会带上启动命令）
//   inherit  command: []        → 显式声明"用镜像自带 ENTRYPOINT"，不被兜底复活
//   custom   command: [...]     → 平台显式指定的启动命令
// 为什么不能只用布尔：把 inherit 与 default 合并会让"我就是要用镜像 ENTRYPOINT"
// 无法表达（如自建镜像自带 ENTRYPOINT），也会让新建的 SGLang 行丢掉必须的启动命令。
export type CommandMode = 'default' | 'inherit' | 'custom';

export type EngineImagePayload = Partial<
	Omit<EngineImage, 'id' | 'engine_key' | 'display' | 'command_configured' | 'command'>
> & {
	engine_key?: string;
	// 三态（见 CommandMode）：null=未声明（回落引擎内置）、[]=用镜像 ENTRYPOINT、[..]=显式命令
	command?: string[] | null;
};

export interface EngineImageListParams {
	platform?: string;
	status?: 1 | 0;
	keyword?: string;
}

// 注册表列表（前端注册表拉取 + 管理页共用）
export const getEngineImages = (params?: EngineImageListParams) =>
	request.get<EngineImage[]>('/engine/images', { params });

// 单行详情
export const getEngineImage = (id: number) => request.get<EngineImage>(`/engine/images/${id}`);

// 新增镜像行
export const createEngineImage = (data: EngineImagePayload) => request.post('/engine/images', data);

// 更新镜像行（字段级 patch：只传要改的字段）
export const updateEngineImage = (id: number, data: EngineImagePayload) =>
	request.put(`/engine/images/${id}`, data);

// 删除镜像行（被推理服务引用时后端拒绝，返回 41303）
export const deleteEngineImage = (id: number) => request.delete(`/engine/images/${id}`);

// ── 环境级镜像覆盖（engine_image_env）────────────────────────────────────
//
// 同一条注册表行在不同环境可用不同镜像地址：dev 走 registry.dev.local、prod 走 registry.prod.local。
// 未配置覆盖的环境回退 engine_image.image —— 注册表里的地址是"默认值"，覆盖是"环境特例"。
export interface EngineImageEnv {
	id: number;
	engine_image_id: number;
	env_id: number;
	env_name: string; // 中文名：开发/测试/生产
	env_code: string; // dev/test/prod
	image: string;
	remark?: string;
}

// 列出环境覆盖（不传 engineImageId 时拉全表，注册表 store 用一次请求缓存全部）
export const getEnvImages = (engineImageId?: number) =>
	request.get<EngineImageEnv[]>('/engine/env-images', {
		params: engineImageId ? { engine_image_id: engineImageId } : undefined,
	});

// 保存某个环境对该镜像行的覆盖（存在即更新；envID 由路径携带）
export const saveEnvImage = (engineImageId: number, envId: number, data: { image: string; remark?: string }) =>
	request.put(`/engine/images/${engineImageId}/env-images/${envId}`, data);

// 清除覆盖 = 该环境回退注册表默认镜像（可逆操作，无需引用检查）
export const deleteEnvImage = (engineImageId: number, envId: number) =>
	request.delete(`/engine/images/${engineImageId}/env-images/${envId}`);
