import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Session, Local } from '/@/utils/storage';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ showSpinner: false, trickleSpeed: 200 });

// 创建 axios 实例
const service = axios.create({
	baseURL: '/api',
	timeout: 50000,
	headers: { 'Content-Type': 'application/json' },
});

// 当前环境的唯一同步来源。页内切换环境时，URL（?envid=）由 router.replace 异步提交，
// 存在一个「store 已新、URL 仍旧」的窗口期；若此时仍优先读 URL，紧随其后的请求
// （如切环境即重载的服务树 /servicetree/tree）就会带上旧 X-ENV-ID，且因无人重试
// 而一直错到手动刷新。故改由 store 的 setCurrentEnv 同步写入本值，请求侧优先取它，
// 保证「最后一次选择」即时生效；URL 仅在冷启动（含分享链接）时兜底。
let resolvedEnvId: string | null = null;

// 由 stores/env.ts 的 setCurrentEnv / clear 调用：同步刷新请求头来源
export function setResolvedEnvId(id: string | number | null | undefined): void {
	resolvedEnvId = id ? String(id) : null;
}

// 读取当前选中的环境 ID（与 stores/env.ts 的持久化 key 对齐）
// export：utils/sse.ts 的 fetch 流式消费复用同一环境解析逻辑
export function getEnvIdHeader(): string {
	// 1) 页内已解析 / 已切换的环境（同步、最新）最高优先 —— 规避上述窗口期
	if (resolvedEnvId) return resolvedEnvId;
	try {
		// 2) 冷启动（含直开分享链接）：URL ?envid 优先于可能过期的 localStorage。
		//    history 路由模式下 query 就在 location.search 里，同步可读，无竞态。
		const fromUrl = new URLSearchParams(window.location.search).get('envid');
		if (fromUrl) return fromUrl;
		const raw = Local.get('currentEnv');
		if (!raw) return '';
		const env = JSON.parse(raw);
		return env?.id ? String(env.id) : '';
	} catch {
		return '';
	}
}

// 请求拦截：注入 token + 环境标识
service.interceptors.request.use(
	(config) => {
		NProgress.start();
		const token = Session.get('token');
		if (token && config.headers) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		// 环境隔离：所有 /api/* 请求自动携带 X-ENV-ID header
		// 后端 EnvMiddleware 从此 header 提取 env_id 放 context，list 接口按 env_id 过滤
		// /api/env 本身不需要带（避免环境未选时拉不到环境列表）
		const envId = getEnvIdHeader();
		if (envId && config.headers) {
			config.headers['X-ENV-ID'] = envId;
		}
		return config;
	},
	(error) => Promise.reject(error)
);

// 响应拦截：统一错误处理（约定后端返回 { code, message, data, trace_id }，code===20000 为成功）
// 错误码体系对齐参考项目：30001 未携带 token / 30002 token 无效或过期 / 30004 无权限，其余 40xxx 为模块业务码
service.interceptors.response.use(
	(response) => {
		NProgress.done();
		const res = response.data;
		if (res.code !== undefined && res.code !== 20000) {
			// token 失效（未携带 / 无效 / 过期）：清会话并跳登录
			if ([30001, 30002].includes(res.code)) {
				Session.clear();
				ElMessageBox.alert('登录已失效，请重新登录', '提示', {}).then(() => {
					window.location.href = '/login';
				});
				return Promise.reject(res);
			}
			ElMessage.error(res.message || '请求失败');
			return Promise.reject(res);
		}
		return res.data !== undefined ? res.data : res;
	},
	(error) => {
		NProgress.done();
		if (error.message?.includes('timeout')) {
			ElMessage.error('网络超时');
		} else if (error.message === 'Network Error') {
			ElMessage.error('网络连接错误');
		} else if (error.response?.status === 401) {
			Session.clear();
			window.location.href = '/login';
		} else {
			ElMessage.error(error.response?.statusText || '接口异常');
		}
		return Promise.reject(error);
	}
);

export default service;
