import Cookies from 'js-cookie';

const TOKEN_KEY = 'token';

// Session 存储（Cookie，用于 token 等会话信息）
export const Session = {
	get(key: string): string | undefined {
		return Cookies.get(key);
	},
	set(key: string, value: string) {
		Cookies.set(key, value);
	},
	remove(key: string) {
		Cookies.remove(key);
	},
	clear() {
		Cookies.remove(TOKEN_KEY);
	},
};

// Local 存储（localStorage，用于持久化配置）
export const Local = {
	get(key: string): string | null {
		return localStorage.getItem(key);
	},
	set(key: string, value: string) {
		localStorage.setItem(key, value);
	},
	remove(key: string) {
		localStorage.removeItem(key);
	},
	clear() {
		localStorage.clear();
	},
};
