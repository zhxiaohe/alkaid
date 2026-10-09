import { defineStore } from 'pinia';
import { Local } from '/@/utils/storage';

// 四套主题：qingjie 晴界（浅·默认）/ xuanye 玄夜（暗）/ aurora 极光（浅+深侧栏）/ yahei 曜黑（暗）
export type ThemeMode = 'qingjie' | 'xuanye' | 'aurora' | 'yahei';

const THEME_KEY = 'theme';
const DARK_THEMES: ThemeMode[] = ['xuanye', 'yahei'];

export const THEMES: { value: ThemeMode; label: string; desc: string; dot: string }[] = [
	{ value: 'qingjie', label: '浅色', desc: '纯白', dot: '#0866FF' },
	{ value: 'xuanye', label: '暗色', desc: '纯黑', dot: '#1D9BF0' },
	{ value: 'aurora', label: '浅色', desc: '极光', dot: '#4C6FFF' },
	{ value: 'yahei', label: '暗色', desc: '琥珀', dot: '#F5B841' },
];

const isThemeMode = (v: unknown): v is ThemeMode => THEMES.some((t) => t.value === v);

// 从 localStorage 恢复主题并应用到 <html>（默认晴界）
export const useThemeStore = defineStore('theme', {
	state: () => ({
		mode: (isThemeMode(Local.get(THEME_KEY)) ? (Local.get(THEME_KEY) as ThemeMode) : 'qingjie'),
	}),
	getters: {
		isDark: (state) => DARK_THEMES.includes(state.mode),
	},
	actions: {
		init() {
			this.apply(this.mode);
		},
		set(mode: ThemeMode) {
			this.mode = mode;
			Local.set(THEME_KEY, mode);
			this.apply(mode);
		},
		apply(mode: ThemeMode) {
			const el = document.documentElement;
			el.dataset.theme = mode;
			// 暗色主题保留 .dark 类，让 Element Plus 官方暗色变量兜底生效
			if (DARK_THEMES.includes(mode)) {
				el.classList.add('dark');
			} else {
				el.classList.remove('dark');
			}
		},
	},
});
