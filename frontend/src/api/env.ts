import request from './request';

// 环境数据结构（对齐后端 EnvItem）
export interface EnvItem {
	id: number;
	name: string; // 中文名：开发/测试/生产
	code: string; // 英文：dev/test/prod
	type: string; // 类型标识：dev/test/prod
	color: string; // 前端展示色：dev=绿 test=黄 prod=红
	status: boolean; // 是否启用
	remarks?: string;
	cluster_name: string; // 对应 K8s 集群名
	cluster_type?: string; // 集群类型：取值源为字典 env_cluster_type（native/ack/tke/vke…），空则 native
	servicetree_url: string; // 该环境上游服务树地址
	namespace: string; // 默认命名空间
}

// 环境写入负载（含 write-only 的 kube_config，后端不回显）
export type EnvPayload = Partial<EnvItem> & { kube_config?: string };

// 获取环境列表（仅返回启用的环境，前端下拉用）
export const getEnvList = () => request.get<EnvItem[]>('/env');

// 获取所有环境（含禁用，管理页用）
export const getEnvListAll = () => request.get<EnvItem[]>('/env', { params: { all: 1 } });

// 获取环境详情
export const getEnvDetail = (id: number) => request.get<EnvItem>(`/env/${id}`);

// 新建环境
export const createEnv = (data: EnvPayload) => request.post('/env', data);

// 更新环境
export const updateEnv = (id: number, data: EnvPayload) => request.put(`/env/${id}`, data);

// 删除环境
export const deleteEnv = (id: number) => request.delete(`/env/${id}`);
