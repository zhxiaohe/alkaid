import request from './request';

// 训练任务列表
export const getTrainingList = (params?: { keyword?: string; page?: number; size?: number; service_id?: number }) =>
	request.get('/training/list', { params });

// 训练任务详情
export const getTrainingDetail = (name: string) => request.get(`/training/${name}`);

// 提交训练任务
export const createTraining = (data: Record<string, unknown>) => request.post('/training', data);

// 停止训练任务
export const stopTraining = (name: string) => request.post(`/training/${name}/stop`);

// 删除训练任务
export const deleteTraining = (name: string) => request.delete(`/training/${name}`);

// 训练日志
export const getTrainingLogs = (name: string, params?: Record<string, unknown>) =>
	request.get(`/training/${name}/logs`, { params });

// MLflow 跟踪链接
export const getTrainingMlflowUrl = (name: string) => request.get(`/training/${name}/mlflow`);
