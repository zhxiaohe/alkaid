<template>
	<div class="navbar">
		<div class="left">
			<!-- 门户模式：品牌 + 横向菜单（首页不显示服务树下拉） -->
			<template v-if="isPortal">
				<div
					class="brand"
					role="button"
					tabindex="0"
					aria-label="回到门户首页"
					@click="$emit('go-portal')"
					@keydown.enter.prevent="$emit('go-portal')"
					@keydown.space.prevent="$emit('go-portal')"
				>
					<AlkaidLogo variant="wordmark" :size="28" />
				</div>
				<div class="top-nav">
					<span class="top-nav-item" :class="{ active: route.path === '/home' }" @click="router.push('/home')">
						<!-- <el-icon><HomeFilled /></el-icon> -->
						首页
					</span>
					<el-dropdown trigger="hover" @command="handleNavCommand">
						<span class="top-nav-item" :class="{ active: route.path.startsWith('/playground') }">
							<el-icon><ChatDotRound /></el-icon>
							<span>模型体验</span>
							<el-icon class="arrow"><ArrowDown /></el-icon>
						</span>
						<template #dropdown>
							<el-dropdown-menu>
								<el-dropdown-item command="/playground/text">文本对话</el-dropdown-item>
								<el-dropdown-item command="/playground/voice">语音对话</el-dropdown-item>
								<el-dropdown-item command="/playground/multimodal">多模态</el-dropdown-item>
							</el-dropdown-menu>
						</template>
					</el-dropdown>
					<span class="top-nav-item" :class="{ active: route.path.startsWith('/resource/tree') }" @click="$emit('select-service')">
						<el-icon><Connection /></el-icon>
						服务管理
					</span>
					<span v-if="route.path.startsWith('/system')" class="top-nav-item active">
						<el-icon><Setting /></el-icon>{{ route.meta?.title || '平台管理' }}
					</span>
				</div>
			</template>

			<!-- 运维模式：折叠按钮 + 面包屑 + 服务树下拉（面包屑后） + 服务路径 -->
			<template v-else>
				<el-icon class="toggle" @click="$emit('toggle')">
					<Fold v-if="!collapse" />
					<Expand v-else />
				</el-icon>
				<el-breadcrumb separator="/">
					<el-breadcrumb-item :to="{ path: '/home' }">门户</el-breadcrumb-item>
					<el-breadcrumb-item v-if="route.path.startsWith('/system')">平台管理</el-breadcrumb-item>
					<el-breadcrumb-item v-if="route.meta?.title && !route.meta?.portal && !route.path.startsWith('/system')">
						{{ route.meta.title }}
					</el-breadcrumb-item>
				</el-breadcrumb>
				<ServiceTreeDropdown />
			</template>
		</div>

		<div class="right">
			<!-- 主题切换（晴界 / 玄夜 / 极光 / 曜黑） -->
			<el-dropdown trigger="click" @command="theme.set">
				<span class="theme-toggle" role="button" tabindex="0" aria-label="切换主题">
					<el-icon :size="17"><Brush /></el-icon>
				</span>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item
							v-for="t in THEMES"
							:key="t.value"
							:command="t.value"
							:class="{ 'is-active': theme.mode === t.value }"
						>
							<span class="theme-dot" :style="{ background: t.dot }"></span>
							<span>{{ t.label }}</span>
							<span class="theme-desc">{{ t.desc }}</span>
						</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>

			<!-- 环境切换（门户+运维都显示，带颜色标识） -->
			<el-dropdown trigger="click" @command="handleEnvChange">
				<span class="env-select">
					<span class="env-dot" :style="{ background: envStore.currentEnv?.color || '#909399' }"></span>
					<span class="env-name">{{ envStore.currentEnv?.name || '未选环境' }}</span>
					<el-icon class="env-arrow"><ArrowDown /></el-icon>
				</span>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item
							v-for="env in envStore.envList"
							:key="env.id"
							:command="env.id"
							:class="{ 'is-active': env.id === envStore.envId }"
						>
							<span class="env-dot" :style="{ background: env.color }"></span>
							<span>{{ env.name }}</span>
							<span class="env-code">({{ env.code }})</span>
						</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>

			<!-- 运维模式：返回门户 -->
			<el-button v-if="!isPortal" link :icon="Promotion" class="back-portal" @click="$emit('go-portal')">
				返回门户
			</el-button>

			<!-- 平台管理下拉（仅 admin 可见） -->
			<el-dropdown v-if="userInfo.isAdmin" trigger="click">
				<span class="nav-link"><el-icon><Setting /></el-icon> 平台管理</span>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item @click="router.push('/system/user')">
							<el-icon><User /></el-icon> 用户管理
						</el-dropdown-item>
						<el-dropdown-item @click="router.push('/system/env')">
							<el-icon><Monitor /></el-icon> 环境管理
						</el-dropdown-item>
						<el-dropdown-item @click="router.push('/system/dict')">
							<el-icon><CollectionTag /></el-icon> 字典配置
						</el-dropdown-item>
						<el-dropdown-item @click="router.push('/system/engine')">
							<el-icon><Coin /></el-icon> 引擎镜像
						</el-dropdown-item>
						<el-dropdown-item @click="router.push('/system/settings')">
							<el-icon><Tools /></el-icon> 系统设置
						</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>

			<!-- 用户下拉 -->
			<el-dropdown @command="handleCommand">
				<span class="user-info">
					<el-icon><User /></el-icon>
					<span class="name">{{ userInfo.userName || 'admin' }}</span>
				</span>
				<template #dropdown>
					<el-dropdown-menu>
						<el-dropdown-item command="profile">个人资料</el-dropdown-item>
						<el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
					</el-dropdown-menu>
				</template>
			</el-dropdown>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import {
	Fold, Expand, User, Connection, Promotion, Setting, CollectionTag, Tools, Monitor, Coin,
	HomeFilled, ChatDotRound, ArrowDown, Brush,
} from '@element-plus/icons-vue';
import { useUserInfo } from '/@/stores/userInfo';
import { useEnvStore } from '/@/stores/env';
import { useThemeStore, THEMES } from '/@/stores/theme';
import ServiceTreeDropdown from '/@/components/ServiceTree/Dropdown.vue';
import AlkaidLogo from '/@/components/Brand/AlkaidLogo.vue';

const props = defineProps<{ collapse: boolean; isPortal: boolean }>();
const emit = defineEmits<{
	(e: 'toggle'): void;
	(e: 'select-service'): void;
	(e: 'go-portal'): void;
	(e: 'env-change'): void;
}>();

const route = useRoute();
const router = useRouter();
const userInfo = useUserInfo();
const envStore = useEnvStore();
const theme = useThemeStore();

// 顶部下拉菜单跳转
const handleNavCommand = (path: string) => router.push(path);

// 环境切换：更新 store（request 拦截器自动带新 X-ENV-ID）+ 同步 URL query + 通知父组件联动
const handleEnvChange = (envId: number) => {
	const target = envStore.envList.find((e) => e.id === envId);
	if (!target) return;
	envStore.setCurrentEnv(target);
	// 同步 URL ?envid=xxx（replace 不污染历史栈）
	router.replace({ query: { ...route.query, envid: String(envId) } });
	// 通知 layout 清空服务树选中 + 重载列表
	emit('env-change');
};

const handleCommand = (cmd: string) => {
	if (cmd === 'logout') {
		userInfo.clear();
		router.push('/login');
	} else if (cmd === 'profile') {
		router.push('/system/user');
	}
};
</script>

<style scoped lang="scss">
.navbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 50px;
	padding: 0 15px;
	border-bottom: 1px solid var(--line);
	transition: background-color 0.25s;
	.left {
		display: flex;
		align-items: center;
		gap: 20px;
		.toggle { font-size: 18px; cursor: pointer; color: var(--ink); }
		.brand {
			display: flex;
			align-items: center;
			gap: 8px;
			cursor: pointer;
			padding: 2px 4px;
			border-radius: 6px;
			transition: background 0.15s;
			&:hover { background: var(--hover-bg); }
			&:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
		}
		.top-nav {
			display: flex;
			align-items: center;
			height: 50px;
		}
		.top-nav-item {
			display: flex;
			align-items: center;
			gap: 4px;
			height: 50px;
			padding: 0 18px;
			cursor: pointer;
			font-size: 14px;
			color: var(--ink);
			border-bottom: 2px solid transparent;
			transition: color 0.2s;
			white-space: nowrap;
			&:focus-visible {
				outline: 2px solid var(--brand);
				outline-offset: -2px;
				border-radius: 4px;
			}
			.arrow { font-size: 12px; margin-left: 2px; }
			&:hover, &.active {
				color: var(--brand);
				border-bottom-color: var(--brand);
				background: transparent;
			}
		}
	}
	.right {
		display: flex;
		align-items: center;
		gap: 16px;
		.theme-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border-radius: 8px;
			cursor: pointer;
			color: var(--ink-mid);
			transition: background 0.15s, color 0.15s;
			&:hover { background: var(--hover-bg); color: var(--brand); }
			&:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
		}
		:deep(.theme-dot) {
			display: inline-block;
			width: 10px;
			height: 10px;
			border-radius: 3px;
			margin-right: 4px;
			flex-shrink: 0;
		}
		:deep(.theme-desc) {
			font-size: 12px;
			color: var(--ink-low);
			margin-left: 6px;
		}
		:deep(.el-dropdown-menu__item.is-active) {
			color: var(--brand);
			background: var(--brand-050);
		}
		.env-select {
			display: flex;
			align-items: center;
			gap: 6px;
			cursor: pointer;
			padding: 4px 10px;
			border: 1px solid var(--line);
			border-radius: 4px;
			font-size: 13px;
			color: var(--ink);
			transition: border-color 0.2s;
			&:hover {
				border-color: var(--brand);
				color: var(--brand);
			}
			.env-dot {
				display: inline-block;
				width: 8px;
				height: 8px;
				border-radius: 50%;
				flex-shrink: 0;
			}
			.env-name { font-weight: 500; }
			.env-arrow { font-size: 11px; }
		}
		:deep(.el-dropdown-menu__item) {
			display: flex;
			align-items: center;
			gap: 6px;
			.env-dot {
				display: inline-block;
				width: 8px;
				height: 8px;
				border-radius: 50%;
				flex-shrink: 0;
			}
			.env-code {
				font-size: 12px;
				color: var(--ink-mid);
			}
			&.is-active {
				color: var(--brand);
				background: var(--brand-050);
			}
		}
		.back-portal { font-size: 13px; }
		.nav-link {
			display: flex;
			align-items: center;
			gap: 4px;
			cursor: pointer;
			font-size: 14px;
			color: var(--ink-mid);
			padding: 4px 8px;
			border-radius: 4px;
			&:hover { color: var(--brand); background: var(--brand-050); }
		}
		.user-info {
			display: flex;
			align-items: center;
			gap: 5px;
			cursor: pointer;
			color: var(--ink);
			.name { font-size: 14px; }
		}
	}
}
</style>
