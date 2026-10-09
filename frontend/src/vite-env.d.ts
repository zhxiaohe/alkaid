/// <reference types="vite/client" />

declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
	export default component;
}

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_PORT: string;
	readonly VITE_OPEN: string;
	readonly VITE_PUBLIC_PATH: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
