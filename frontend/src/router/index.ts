import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Session } from '/@/utils/storage';

const Layout = () => import('/@/layout/index.vue');

export const routes: RouteRecordRaw[] = [
	{
		path: '/login',
		name: 'login',
		component: () => import('/@/views/login/index.vue'),
		meta: { title: '登录' },
	},
	// === 门户模式菜单组（左侧菜单显示这些，无服务树） ===
	{
		path: '/',
		component: Layout,
		redirect: '/home',
		meta: { title: '门户', icon: 'Promotion', portal: true },
		children: [
			{
				path: '/home',
				name: 'home',
				component: () => import('/@/views/home/index.vue'),
				meta: { title: '门户首页', icon: 'Promotion', portal: true },
			},
		],
	},
	{
		path: '/playground',
		component: Layout,
		redirect: '/playground/text',
		meta: { title: '模型体验', icon: 'ChatDotRound', portal: true },
		children: [
			{
				path: '/playground/text',
				name: 'playgroundText',
				component: () => import('/@/views/playground/text.vue'),
				meta: { title: '文本对话', icon: 'ChatLineSquare', portal: true },
			},
			{
				path: '/playground/voice',
				name: 'playgroundVoice',
				component: () => import('/@/views/playground/voice.vue'),
				meta: { title: '语音对话', icon: 'Microphone', portal: true },
			},
			{
				path: '/playground/multimodal',
				name: 'playgroundMM',
				component: () => import('/@/views/playground/multimodal.vue'),
				meta: { title: '多模态', icon: 'PictureFilled', portal: true },
			},
		],
	},
	// 平台管理：系统级配置，走门户布局（横向菜单），不进左侧菜单
	{
		path: '/system',
		component: Layout,
		redirect: '/system/user',
		meta: { portal: true },
		children: [
			{ path: '/system/user', name: 'sysUser', component: () => import('/@/views/system/user.vue'), meta: { title: '用户管理', portal: true } },
			{ path: '/system/dict', name: 'sysDict', component: () => import('/@/views/system/dict.vue'), meta: { title: '字典配置', portal: true } },
			{ path: '/system/engine', name: 'sysEngine', component: () => import('/@/views/system/engine.vue'), meta: { title: '引擎镜像', portal: true } },
			{ path: '/system/env', name: 'sysEnv', component: () => import('/@/views/system/env.vue'), meta: { title: '环境管理', portal: true } },
			{ path: '/system/settings', name: 'sysSettings', component: () => import('/@/views/system/settings.vue'), meta: { title: '系统设置', portal: true } },
		],
	},
	// === 集群管理：环境维度（1 env = 1 集群），复用顶部环境切换栏，不依赖服务树节点 ===
	{
		path: '/cluster',
		component: Layout,
		redirect: '/cluster/overview',
		meta: { title: '集群管理', icon: 'Monitor', showServiceTree: true },
		children: [
			{ path: '/cluster/overview', name: 'clusterOverview', component: () => import('/@/views/cluster/overview.vue'), meta: { title: '资源总览', icon: 'Monitor', showServiceTree: true } },
			{ path: '/cluster/nodes', name: 'clusterNodes', component: () => import('/@/views/cluster/nodes.vue'), meta: { title: '节点管理', icon: 'Grid', showServiceTree: true } },
			{ path: '/cluster/pools', name: 'clusterPools', component: () => import('/@/views/cluster/pools.vue'), meta: { title: '节点池', icon: 'Coin', showServiceTree: true } },
			{ path: '/cluster/gpus', name: 'clusterGpus', component: () => import('/@/views/cluster/gpus.vue'), meta: { title: 'GPU管理', icon: 'Cpu', showServiceTree: true } },
			{ path: '/cluster/pods', name: 'clusterPods', component: () => import('/@/views/cluster/pods.vue'), meta: { title: '服务实例', icon: 'Box', showServiceTree: true } },
			{ path: '/cluster/storage', name: 'clusterStorage', component: () => import('/@/views/cluster/storage.vue'), meta: { title: '存储卷', icon: 'Files', showServiceTree: true } },
			{ path: '/cluster/storage-classes', name: 'clusterStorageClasses', component: () => import('/@/views/cluster/storage-class.vue'), meta: { title: '存储类', icon: 'Coin', showServiceTree: true } },
		],
	},
	// === 运维模式菜单组（需先选服务树节点，左侧菜单 + 服务树栏） ===
	{
		path: '/inference',
		component: Layout,
		redirect: '/inference/list',
		meta: { title: '推理管理', icon: 'Cpu', showServiceTree: true },
		children: [
			{
				path: '/inference/list',
				name: 'inferenceList',
				component: () => import('/@/views/inference/list.vue'),
				meta: { title: '推理服务', icon: 'Cpu', showServiceTree: true },
			},
			{
				path: '/inference/detail/:name',
				name: 'inferenceDetail',
				component: () => import('/@/views/inference/detail.vue'),
				meta: { title: '推理详情', icon: 'Cpu', showServiceTree: true },
			},
		],
	},
	{
		path: '/training',
		component: Layout,
		redirect: '/training/list',
		meta: { title: '训练管理', icon: 'DataAnalysis', showServiceTree: true },
		children: [
			{
				path: '/training/list',
				name: 'trainingList',
				component: () => import('/@/views/training/list.vue'),
				meta: { title: '训练任务', icon: 'DataAnalysis', showServiceTree: true },
			},
			{
				path: '/training/detail/:name',
				name: 'trainingDetail',
				component: () => import('/@/views/training/detail.vue'),
				meta: { title: '训练详情', icon: 'DataAnalysis', showServiceTree: true },
			},
		],
	},
	{
		path: '/model',
		component: Layout,
		redirect: '/model/list',
		meta: { title: '模型仓库', icon: 'Files', showServiceTree: true },
		children: [
			{
				path: '/model/list',
				name: 'modelList',
				component: () => import('/@/views/model/list.vue'),
				meta: { title: '模型管理', icon: 'Files', showServiceTree: true },
			},
			{
				path: '/model/detail/:name',
				name: 'modelDetail',
				component: () => import('/@/views/model/detail.vue'),
				meta: { title: '模型详情', icon: 'Files', showServiceTree: true },
			},
		],
	},
	{
		path: '/gateway',
		component: Layout,
		redirect: '/gateway/list',
		meta: { title: '网关管理', icon: 'Connection', showServiceTree: true },
		children: [
			{
				path: '/gateway/list',
				name: 'gatewayList',
				component: () => import('/@/views/gateway/list.vue'),
				meta: { title: '网关管理', icon: 'Connection', showServiceTree: true },
			},
		],
	},
	{
		path: '/:pathMatch(.*)*',
		name: 'notFound',
		component: () => import('/@/views/error/404.vue'),
		meta: { title: '404' },
	},
];

const router = createRouter({
	history: createWebHistory(),
	routes,
});

// 路由守卫：未登录跳登录页；/system 仅 admin 可访问
router.beforeEach((to, _from, next) => {
	document.title = `${to.meta.title || ''} - Alkaid`;
	const token = Session.get('token');
	if (to.path === '/login') {
		next();
	} else if (!token) {
		next('/login');
	} else if (to.path.startsWith('/system')) {
		let roles: string[] = [];
		try {
			roles = JSON.parse(Session.get('roles') || '[]');
		} catch {
			roles = [];
		}
		// 兜底：旧登录态无 roles 时，userName=admin 也放行
		const userName = Session.get('userName') || '';
		if (!roles.includes('admin') && userName !== 'admin') {
			next('/home');
			return;
		}
		next();
	} else {
		next();
	}
});

export default router;
