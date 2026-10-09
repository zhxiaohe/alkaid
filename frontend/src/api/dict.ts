import request from './request';

// 数据字典（对齐后端 SysDict）
export interface DictItem {
	id: number;
	code: string;
	name: string;
	remark?: string;
	status: boolean;
	type: string; // select/tag/color 等展示类型
}

// 字典项（对齐后端 SysDictItem）
export interface DictEntry {
	id: number;
	dict_id: number;
	label: string;
	value: string;
	sort: number;
	enabled: boolean;
	remark?: string;
}

// 字典 + 其字典项（Get 聚合返回）
export interface DictDetail {
	dict: DictItem;
	items: DictEntry[];
}

export type DictPayload = Partial<DictItem> & { code?: string; name?: string };
export type DictEntryPayload = Partial<DictEntry> & { label?: string; value?: string };

// 获取字典列表（支持 keyword 模糊搜索）
export const getDictList = (keyword?: string) =>
	request.get<DictItem[]>('/dict', { params: { keyword } });

// 获取字典详情（含其字典项）
export const getDictDetail = (id: number) => request.get<DictDetail>(`/dict/${id}`);

// 按编码获取启用的字典项（下拉/枚举回显用）
export const getDictByCode = (code: string) => request.get<DictEntry[]>(`/dict/info/${code}`);

// 新建字典
export const createDict = (data: DictPayload) => request.post('/dict', data);

// 更新字典
export const updateDict = (id: number, data: DictPayload) => request.put(`/dict/${id}`, data);

// 删除字典（级联删除字典项）
export const deleteDict = (id: number) => request.delete(`/dict/${id}`);

// 新增字典项
export const createDictEntry = (dictId: number, data: DictEntryPayload) =>
	request.post(`/dict/${dictId}/items`, data);

// 更新字典项
export const updateDictEntry = (dictId: number, entryId: number, data: DictEntryPayload) =>
	request.put(`/dict/${dictId}/item/${entryId}`, data);

// 删除字典项
export const deleteDictEntry = (dictId: number, entryId: number) =>
	request.delete(`/dict/${dictId}/item/${entryId}`);

// 业务表单下拉选项：拉指定编码的启用字典项，缓存避免重复请求
const optionCache = new Map<string, Promise<DictEntry[]>>();
export const getDictOptions = (code: string) => {
	if (!optionCache.has(code)) {
		optionCache.set(
			code,
			getDictByCode(code)
				.then((data) => (data as unknown as DictEntry[]) || [])
				.catch(() => [])
		);
	}
	return optionCache.get(code) as Promise<DictEntry[]>;
};