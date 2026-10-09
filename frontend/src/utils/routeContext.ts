import type { LocationQuery } from 'vue-router';

// 控制台导航上下文透传：跳转时把当前 URL 的 envid / service_id 保留到新地址，
// 保证“复制链接直达当前环境+服务”在控制台内所有页面跳转间不丢失。
// extra 显式传入的值优先；空串/空值会从结果中剔除。
export function withContextQuery(
	current: LocationQuery,
	extra: Record<string, string | number | null | undefined> = {}
): LocationQuery {
	const q: Record<string, string | number | null | undefined> = { ...extra };
	const envid = current.envid;
	const serviceId = current.service_id;
	if (envid && q.envid == null) q.envid = String(envid);
	if (serviceId && q.service_id == null) q.service_id = String(serviceId);
	const out: LocationQuery = {};
	for (const [k, v] of Object.entries(q)) {
		if (v === null || v === undefined || v === '') continue;
		out[k] = String(v);
	}
	return out;
}