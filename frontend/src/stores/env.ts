import { defineStore } from 'pinia';
import { getEnvList, type EnvItem } from '/@/api/env';
import { setResolvedEnvId } from '/@/api/request';
import { Local } from '/@/utils/storage';

const ENV_KEY = 'currentEnv';

// 启动自愈：从 localStorage 恢复上次选中的环境
function loadInitialEnv(): EnvItem | null {
	try {
		const raw = Local.get(ENV_KEY);
		return raw ? (JSON.parse(raw) as EnvItem) : null;
	} catch {
		return null;
	}
}

const initial = loadInitialEnv();

export const useEnvStore = defineStore('env', {
	state: () => ({
		envList: [] as EnvItem[],
		currentEnv: initial as EnvItem | null,
		loading: false,
	}),
	getters: {
		envId: (s) => s.currentEnv?.id ?? 0,
		envCode: (s) => s.currentEnv?.code ?? '',
		hasSelected: (s) => !!s.currentEnv,
		// 环境下拉用：带颜色
		envOptions: (s) =>
			s.envList.map((e) => ({
				label: e.name,
				value: e.id,
				color: e.color,
				code: e.code,
			})),
	},
	actions: {
		// 从 URL query 读 envid（优先级最高，便于分享链接）
		_envIdFromUrl(): number {
			try {
				const params = new URLSearchParams(window.location.search);
				const v = params.get('envid');
				return v ? parseInt(v, 10) : 0;
			} catch {
				return 0;
			}
		},
		// 拉取环境列表；选中优先级：URL ?envid=xxx > localStorage > 默认第一个
		async loadEnvs() {
			this.loading = true;
			try {
				const list = (await getEnvList()) as unknown as EnvItem[];
				this.envList = Array.isArray(list) ? list : [];
				// 1) URL 优先级最高
				const urlEnvId = this._envIdFromUrl();
				if (urlEnvId > 0) {
					const urlMatch = this.envList.find((e) => e.id === urlEnvId);
					if (urlMatch) {
						this.setCurrentEnv(urlMatch);
						return;
					}
				}
				// 2) localStorage 恢复
				if (this.currentEnv) {
					const stillExists = this.envList.some((e) => e.id === this.currentEnv!.id);
					if (!stillExists) this.currentEnv = null;
				}
				// 3) 兜底选第一个
				if (!this.currentEnv && this.envList.length > 0) {
					this.setCurrentEnv(this.envList[0]);
				}
			} catch (e) {
				// 兜底：上游未配置时给一份本地默认环境，保证 demo 可用
				if (this.envList.length === 0) {
					this.envList = [
						{ id: 1, name: '开发', code: 'dev', type: 'dev', color: '#52c41a', status: true, cluster_name: 'dev-cluster', servicetree_url: '', namespace: 'ai-dev' },
						{ id: 2, name: '测试', code: 'test', type: 'test', color: '#faad14', status: true, cluster_name: 'test-cluster', servicetree_url: '', namespace: 'ai-test' },
						{ id: 3, name: '生产', code: 'prod', type: 'prod', color: '#ff4d4f', status: true, cluster_name: 'prod-cluster', servicetree_url: '', namespace: 'ai-prod' },
					];
					const urlEnvId = this._envIdFromUrl();
					if (urlEnvId > 0) {
						const urlMatch = this.envList.find((e) => e.id === urlEnvId);
						if (urlMatch) {
							this.setCurrentEnv(urlMatch);
							return;
						}
					}
					if (!this.currentEnv) this.setCurrentEnv(this.envList[0]);
				}
			} finally {
				this.loading = false;
			}
		},
		// 切换环境：更新 state + 持久化 + 同步刷新请求头来源（触发调用方联动）
		setCurrentEnv(env: EnvItem) {
			this.currentEnv = env;
			Local.set(ENV_KEY, JSON.stringify(env));
			// 同步写「已解析环境」，使随后的请求（此刻 URL 可能还没跟上）立刻带上新 X-ENV-ID
			setResolvedEnvId(env?.id);
		},
		clear() {
			this.currentEnv = null;
			Local.remove(ENV_KEY);
			setResolvedEnvId(null);
		},
	},
});
