import request from './request';

// 平台用户（对齐后端 SysUser）
export interface SysUser {
	id: number;
	username: string;
	nickname: string;
	email?: string;
	mobile?: string;
	roles: string; // 逗号分隔：admin,user
	status: boolean;
	remark?: string;
	created_at?: string;
}

// 用户分页列表返回
export interface UserPageResult {
	total: number;
	list: SysUser[];
	page: number;
	size: number;
}

export type UserPayload = Partial<SysUser> & { password?: string };

// 获取用户列表
export const getUserList = (params?: { keyword?: string; page?: number; size?: number }) =>
	request.get<UserPageResult>('/user', { params });

// 用户角色列表
export const getUserRoles = () => request.get<string[]>('/user/roles');

// 新建用户
export const createUser = (data: UserPayload) => request.post('/user', data);

// 更新用户
export const updateUser = (id: number, data: UserPayload) => request.put(`/user/${id}`, data);

// 删除用户
export const deleteUser = (id: number) => request.delete(`/user/${id}`);