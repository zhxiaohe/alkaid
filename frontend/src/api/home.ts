import request from './request';

// 首页概览统计（后端 /api/dashboard/home_stat）
export interface HomeStats {
	inference_total: number; // 推理服务总数（当前环境）
	inference_running: number; // 运行中的推理服务
	training_total: number; // 训练任务总数
	training_succeeded: number; // 成功的训练任务
	gpu_total: number; // 推理已占用 GPU 数
	model_total: number; // 模型数（公共基座 + 当前环境私有）
	version_total: number; // 模型版本数
	gateway_total: number; // 网关数（当前环境）
	env_total: number; // 启用环境数（全局）
}

export const getHomeStats = () => request.get<HomeStats>('/dashboard/home_stat');