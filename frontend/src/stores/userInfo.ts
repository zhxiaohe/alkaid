import { defineStore } from 'pinia';
import { Session } from '/@/utils/storage';

function loadRoles(): string[] {
	try {
		return JSON.parse(Session.get('roles') || '[]');
	} catch {
		return [];
	}
}

// 解析 JWT payload（不验签，仅取 username/is_admin 用于前端菜单展示）
function parseJwt(token: string): { username?: string; is_admin?: boolean } | null {
	try {
		const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		return JSON.parse(atob(payload));
	} catch {
		return null;
	}
}

// 启动自愈：旧登录态只有 token、没有 userName/roles 时，从 JWT 恢复
// 注意：后端 MVP 阶段 JWT 的 is_admin 恒为 true，不可信，角色一律按 username 推导
function hydrate(): { userName: string; roles: string[] } {
	let userName = Session.get('userName') || '';
	let roles = loadRoles();
	const token = Session.get('token') || '';
	if (token && (!userName || !roles.length)) {
		const claims = parseJwt(token);
		if (claims?.username && !userName) userName = claims.username;
		if (!roles.length && userName) {
			roles = userName === 'admin' ? ['admin', 'user'] : ['user'];
		}
	}
	return { userName, roles };
}

const initial = hydrate();

export const useUserInfo = defineStore('userInfo', {
	state: () => ({
		token: Session.get('token') || '',
		userName: initial.userName,
		roles: initial.roles,
	}),
	getters: {
		// roles 含 admin，或兜底：userName 为 admin
		isAdmin: (state) => state.roles.includes('admin') || state.userName === 'admin',
	},
	actions: {
		setToken(token: string) {
			this.token = token;
			Session.set('token', token);
		},
		setUserInfo(name: string, roles: string[]) {
			this.userName = name;
			this.roles = roles;
			Session.set('userName', name);
			Session.set('roles', JSON.stringify(roles));
		},
		clear() {
			this.token = '';
			this.userName = '';
			this.roles = [];
			Session.remove('token');
			Session.remove('userName');
			Session.remove('roles');
		},
	},
});
