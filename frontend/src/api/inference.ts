import request from './request';

// 推理服务列表
export const getInferenceList = (params?: { keyword?: string; page?: number; size?: number; service_id?: number }) =>
	request.get('/inference/list', { params });

// 推理服务详情
export const getInferenceDetail = (name: string) => request.get(`/inference/${name}`);

// 创建推理服务
export const createInference = (data: Record<string, unknown>) => request.post('/inference', data);

// 更新推理服务（扩缩容 / 镜像更新）
export const updateInference = (name: string, data: Record<string, unknown>) =>
	request.put(`/inference/${name}`, data);

// 删除推理服务
export const deleteInference = (name: string) => request.delete(`/inference/${name}`);

// 下发到集群：spec 重渲染 → server-side apply（fieldManager=alkaid）
export const applyInference = (name: string, data?: { force?: boolean }) =>
	request.post(`/inference/${name}/apply`, data ?? {});

// 实例列表 / 日志已收敛到集群模块（app/cluster）：
// - 实例：GET  /api/cluster/pods?service_ref=xxx（api/cluster.ts getClusterPods）
// - 日志：GET  /api/cluster/pods/:name/logs（SSE，utils/sse.ts streamRequest 消费）

// 服务启动命令（只读）：与 apply 同一条渲染路径，返回 command + args + 可直接复制的单行命令
export interface InferenceArgv {
	name: string;
	image: string;
	command: string[];
	args: string[];
	argv: string[];
	entrypoint_source: 'image' | 'platform';
	shell_line: string;
	renderer_version: string;
}

export const getInferenceArgv = (name: string) =>
	request.get<InferenceArgv>(`/inference/${name}/argv`);

// KEDA 可用性探测（弹性策略入口置灰依据）
export const getAutoscaleAvailable = (envId?: number) =>
	request.get('/inference/autoscale/available', { params: envId ? { env_id: envId } : {} });
