<template>
	<div class="sidebar">
		<div class="logo">
			<AlkaidLogo v-if="!collapse" variant="wordmark" :size="36" />
			<AlkaidLogo v-else variant="star" :size="20" />
		</div>
		<el-menu
			:default-active="activeMenu"
			:collapse="collapse"
			:collapse-transition="false"
			@select="handleSelect"
		>
			<template v-for="r in menuRoutes" :key="r.path">
				<el-sub-menu v-if="r.children && r.children.length > 1" :index="r.path">
					<template #title>
						<el-icon v-if="r.meta?.icon"><component :is="r.meta.icon" /></el-icon>
						<span>{{ r.meta?.title }}</span>
					</template>
					<el-menu-item v-for="child in r.children" :key="child.path" :index="child.path">
						{{ child.meta?.title }}
					</el-menu-item>
				</el-sub-menu>
				<el-menu-item v-else-if="r.children?.length" :index="r.children[0].path">
					<el-icon v-if="r.children[0].meta?.icon"><component :is="r.children[0].meta.icon" /></el-icon>
					<template #title>{{ r.children[0].meta?.title }}</template>
				</el-menu-item>
			</template>
		</el-menu>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { routes } from '/@/router';
import { withContextQuery } from '/@/utils/routeContext';
import AlkaidLogo from '/@/components/Brand/AlkaidLogo.vue';

const props = defineProps<{ collapse: boolean; isPortal: boolean }>();

const route = useRoute();
const router = useRouter();
const activeMenu = computed(() => route.path);

// 菜单跳转：保留当前 envid / service_id（控制台内部导航不丢上下文）
const handleSelect = (path: string) => {
	router.push({ path, query: withContextQuery(route.query) });
};

// 根据模式过滤菜单：首页模式只显示 portal 路由，运维模式只显示非 portal 路由
const menuRoutes = computed(() =>
	routes.filter((r) => {
		if (!r.meta?.title) return false;
		if (r.path === '/login' || r.path.includes(':pathMatch')) return false;
		// 运维模式下如果有 portal 子路由（home/playground），也不显示它们
		const isPortalRoute = !!r.meta?.portal;
		return props.isPortal ? isPortalRoute : !isPortalRoute;
	})
);
</script>

<style scoped lang="scss">
.sidebar {
	height: 100%;
	display: flex;
	flex-direction: column;
}
.logo {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 9px;
	height: 50px;
	// 侧栏可能是深底（极光 / 玄夜 / 曜黑），字标改用反色字
	--logo-word: var(--logo-word-inv);
	color: var(--menu-text);
	background: var(--side-bg);
	border-bottom: 1px solid var(--line-soft);
	white-space: nowrap;
	overflow: hidden;
	transition: background-color 0.25s;
}
.el-menu {
	border-right: none;
	flex: 1;
	// 主题化菜单：颜色全部走 tokens 变量（CSS 变量会向菜单项继承）
	--el-menu-bg-color: var(--menu-bg);
	--el-menu-text-color: var(--menu-text);
	--el-menu-hover-bg-color: var(--menu-hover);
	--el-menu-active-color: var(--menu-active);
}
</style>
