import request from './request';

// 模型列表
export const getModelList = (params?: { keyword?: string; page?: number; size?: number; service_id?: number }) =>
	request.get('/model/list', { params });

// 模型详情（含版本列表及状态）
export const getModelDetail = (name: string) => request.get(`/model/${name}`);

// 录入模型（S3 路径 / NAS 缓存 / 本地路径 / 训练产物）
export const createModel = (data: Record<string, unknown>) => request.post('/model', data);

// 新增模型版本
export const createModelVersion = (name: string, data: Record<string, unknown>) =>
	request.post(`/model/${name}/version`, data);

// 版本 promote（staged → production，旧 production 自动 archived）
export const promoteVersion = (name: string, vid: string, data?: { eval_report_id?: number; comment?: string }) =>
	request.post(`/model/${name}/versions/${vid}/promote`, data || {});

// 版本 rollback（回滚推理服务到指定/上一个 archived production 版本）
export const rollbackVersion = (name: string, vid: string, data?: { target_version?: string }) =>
	request.post(`/model/${name}/versions/${vid}/rollback`, data || {});

// 版本 archive（staged/production → archived）
export const archiveVersion = (name: string, vid: string) =>
	request.post(`/model/${name}/versions/${vid}/archive`);

// 删除模型
export const deleteModel = (name: string) => request.delete(`/model/${name}`);

// 模型版本（状态机：staged → production → archived → deleted）
export interface ModelVersion {
	id: number; // 版本主键：创建推理服务时作为 model_version_id 显式绑定（Pin 模式）
	version: string;
	status: 'staged' | 'production' | 'archived' | 'deleted';
	storage_path: string;
	size_gb: number;
	created_at: string;
	promoted_by?: string;
	promoted_at?: string;
	eval_report_id?: number;
}

// 模型详情响应
export interface ModelDetail {
	meta: {
		name: string;
		base: string;
		params: string;
		latest_version: string;
		framework: string;
		size_gb: number;
		storage_path: string;
		cache_nas: string;
		local_path: string;
		service_tree_id: number;
		created_at: string;
	};
	versions: ModelVersion[];
}

// ---- 权重预热（S3 → PVC 灌数）：模型版本行发起，集群 Batch Job 执行，状态懒回读 ----
export interface WarmupItem {
	id: number;
	env_id: number;
	namespace: string;
	pvc_name: string;
	model_name: string;
	version: string;
	storage_path: string;
	dest_dir: string;
	job_name: string;
	status: 'Running' | 'Success' | 'Failed';
	message: string;
	created_by: string;
	created_at: string;
	updated_at: string;
}

// 发起预热：目标 PVC 须与本环境集群镜像一致；灌数 Job 挂卷读写按 §7.1 目录约定落盘
export const createWarmup = (data: { model: string; version: string; namespace: string; pvc_name: string }) =>
	request.post('/model/warmups', data);

// 预热记录列表（进行中的记录后端会懒回读集群 Job 状态）
export const getWarmups = (params?: Record<string, unknown>) => request.get('/model/warmups', { params });

// 删除预热记录（并 best-effort 清理集群 Job）
export const deleteWarmup = (id: number) => request.delete(`/model/warmups/${id}`);

// ---- 模型-存储卷绑定（模型 ↔ PVC 的显式关联：手工绑定 + 预热发起自动建立）----
export interface ModelVolumeItem {
	id: number;
	env_id: number;
	namespace: string;
	pvc_name: string;
	model_name: string;
	storage_type: 'nas' | 's3'; // nas = NAS/NFS 缓存直通；s3 = S3 权重预热目标
	dest_dir: string;
	created_by: string;
	created_at: string;
	// join 集群镜像的卷状态（卷被集群侧删除时为空）
	pvc_phase?: string;
	pvc_capacity_bytes?: number;
	pvc_access_modes?: string;
}

// 模型的存储卷绑定列表（model 缺省 = 当前环境全部）
export const getModelVolumes = (params?: { model?: string }) => request.get('/model/volumes', { params });

// 绑定模型与存储卷（卷须已在集群镜像表中存在；重复绑定幂等更新 storage_type）
export const bindModelVolume = (data: {
	model: string;
	namespace: string;
	pvc_name: string;
	storage_type: 'nas' | 's3';
	dest_dir?: string;
}) => request.post('/model/volumes', data);

// 解绑（仅解除平台侧关联，不影响集群内卷与其数据）
export const unbindModelVolume = (id: number) => request.delete(`/model/volumes/${id}`);
