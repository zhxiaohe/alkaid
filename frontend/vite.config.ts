import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { defineConfig, loadEnv, type ConfigEnv } from 'vite';

const pathResolve = (dir: string): string => resolve(__dirname, '.', dir);

const alias: Record<string, string> = {
	'/@': pathResolve('./src/'),
};

export default defineConfig((mode: ConfigEnv) => {
	const env = loadEnv(mode.mode, process.cwd());
	return {
		plugins: [vue()],
		resolve: { alias },
		base: mode.command === 'serve' ? './' : env.VITE_PUBLIC_PATH || './',
		server: {
			host: '0.0.0.0',
			port: Number(env.VITE_PORT) || 5173,
			open: env.VITE_OPEN === 'true',
			proxy: {
				'/api': {
					target: env.VITE_API_URL || 'http://localhost:8080',
					ws: true,
					changeOrigin: true,
					// 不重写：后端路由统一挂在 /api 下（/api/inference, /api/servicetree ...）
				},
			},
		},
		build: {
			outDir: 'dist',
			sourcemap: false,
			chunkSizeWarningLimit: 1500,
			rollupOptions: {
				output: {
					manualChunks: {
						vue: ['vue', 'vue-router', 'pinia'],
						element: ['element-plus', '@element-plus/icons-vue'],
					},
				},
			},
		},
	};
});
