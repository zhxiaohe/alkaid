<template>
	<el-container class="layout-container">
		<!-- 门户模式隐藏左侧菜单，导航全放顶部 -->
		<el-aside v-if="!isPortal" :width="collapse ? '64px' : '210px'" class="layout-aside">
			<Sidebar :collapse="collapse" :isPortal="false" />
		</el-aside>
		<el-container>
			<el-header class="layout-header">
				<Navbar
					:collapse="collapse"
					:isPortal="isPortal"
					@toggle="collapse = !collapse"
					@select-service="selectServiceDialog = true"
					@go-portal="router.push('/home')"
					@env-change="onEnvChanged"
				/>
			</el-header>
			<!-- 控制台模式：服务节点基础信息条（完整路径/负责人/环境） -->
			<ContextBar v-if="!isPortal" />
			<el-container class="layout-body" :style="{ height: isPortal ? 'calc(100vh - 50px)' : 'calc(100vh - 82px)' }">
				<el-main class="layout-main" :class="{ 'layout-main--wide': isPortal }">
					<AppMain />
				</el-main>
			</el-container>
		</el-container>

		<!-- 首页模式下的服务树选择 Dialog -->
		<el-dialog v-model="selectServiceDialog" title="选择服务" width="420px" :close-on-click-modal="true" append-to-body>
			<div class="select-service-hint">选择一个服务节点，进入该服务的运维视图</div>
			<ServiceTreeSelectable @select="onServiceSelected" />
		</el-dialog>
	</el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import Sidebar from './components/Sidebar.vue';
import Navbar from './components/Navbar.vue';
import AppMain from './components/AppMain.vue';
import ContextBar from './components/ContextBar.vue';
import ServiceTreeSelectable from '/@/components/ServiceTree/Selectable.vue';
import { useServiceTreeStore } from '/@/stores/serviceTree';
import { useEnvStore } from '/@/stores/env';

const collapse = ref(false);
const selectServiceDialog = ref(false);

const route = useRoute();
const router = useRouter();
const treeStore = useServiceTreeStore();
const envStore = useEnvStore();

// 首页模式：路由有 portal meta → 隐藏左侧菜单
const isPortal = computed(() => !!route.meta?.portal);

// 启动时拉取环境列表（envStore 内部会自动选中第一个 + 持久化），完成后恢复 URL 里的服务选中
onMounted(async () => {
	await envStore.loadEnvs();
	await restoreServiceFromUrl();
});

// 打开分享链接：URL ?service_id 定位节点并高亮；节点不存在则提示并清参
const restoreServiceFromUrl = async () => {
	const sid = Number(route.query.service_id || 0);
	if (sid <= 0) return;
	// 以当前环境为准重载整树（X-ENV-ID 由请求拦截器注入），再按 id 定位
	await treeStore.loadTree();
	if (treeStore.selectById(sid)) return;
	ElMessage.warning('链接中的服务不存在或已被删除');
	router.replace({ query: { ...route.query, service_id: undefined } });
};

// URL ?envid 变化监听：用户手动改浏览器地址栏时，同步 store + 联动服务树
watch(
	() => route.query.envid as string | undefined,
	(newVal) => {
		const urlEnvId = newVal ? parseInt(newVal, 10) : 0;
		if (urlEnvId <= 0) return;
		if (envStore.envId === urlEnvId) return; // 一致则跳过
		const target = envStore.envList.find((e) => e.id === urlEnvId);
		if (!target) return; // envList 还没拉到或不包含该 id
		envStore.setCurrentEnv(target);
		onEnvChanged();
	}
);

// 环境切换联动：
// 1. 清空服务树选中（不同环境对应不同树/资源，旧选中失效）
// 2. 重载服务树（上游可能按环境返回不同树结构）
// 3. 列表页通过 watch(serviceId) 自然重载；env_id 已由 request 拦截器自动注入
const onEnvChanged = () => {
	treeStore.clear();
	treeStore.loadTree();
	// 不同环境的树/资源不同：清掉 URL 里旧的 service_id，避免误指向其它环境的服务
	if (route.query.service_id) {
		router.replace({ query: { ...route.query, service_id: undefined } });
	}
	// 若当前在详情页（依赖某个具体资源），环境切换后回到列表更合理
	if (route.path.includes('/detail/')) {
		const seg = route.path.split('/')[1];
		if (seg) router.push(`/${seg}/list`);
	}
};

// 从首页模式选了服务 → 存到 store → 自动跳 inference/list（运维模式），带上 envid + service_id 便于分享
const onServiceSelected = () => {
	selectServiceDialog.value = false;
	const query: Record<string, string> = {};
	if (envStore.envId) query.envid = String(envStore.envId);
	if (treeStore.serviceId) query.service_id = String(treeStore.serviceId);
	router.push({ path: '/inference/list', query });
};
</script>

<style scoped lang="scss">
.layout-container {
	height: 100vh;
}
.layout-aside {
	background: var(--side-bg);
	border-right: 1px solid var(--line);
	transition: width 0.3s, background-color 0.25s;
	overflow: hidden;
}
.layout-header {
	background: var(--header-bg);
	border-bottom: 1px solid var(--line);
	padding: 0;
	height: 50px;
	line-height: 50px;
}
.layout-body {
	// 高度按是否带信息条动态计算（见模板内联样式：50px 顶栏 / +32px 信息条）
}
.layout-main {
	background: var(--page-bg);
	padding: 15px;
	overflow-y: auto;
	&--wide {
		// 门户模式全宽，Banner 等铺满顶栏下方
		background: var(--page-bg);
		padding: 0;
	}
}
.select-service-hint {
	font-size: 13px;
	color: var(--ink-mid);
	margin-bottom: 12px;
}
</style>
