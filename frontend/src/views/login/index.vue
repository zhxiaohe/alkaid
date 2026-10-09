<template>
	<div class="login-container">
		<div class="login-box">
			<div class="login-brand">
				<AlkaidLogo variant="wordmark" :size="52" />
			</div>
			<h2>瑶光</h2>
			<p class="login-sub">AI 推理训练一体化运维平台</p>
			<el-form :model="form" label-width="0" @keyup.enter="handleLogin">
				<el-form-item>
					<el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
				</el-form-item>
				<el-form-item>
					<el-input v-model="form.password" type="password" placeholder="密码" :prefix-icon="Lock" show-password />
				</el-form-item>
				<el-button type="primary" class="login-btn" :loading="loading" @click="handleLogin">登录</el-button>
			</el-form>
		</div>
	</div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AlkaidLogo from '/@/components/Brand/AlkaidLogo.vue';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useUserInfo } from '/@/stores/userInfo';
import request from '/@/api/request';

// 开发期预填账号：与后端种子账号保持一致（admin / admin123）；生产构建下预填为空
const DEV_PREFILL = import.meta.env.DEV;
const form = reactive({
	username: DEV_PREFILL ? 'admin' : '',
	password: DEV_PREFILL ? 'admin123' : '',
});
const loading = ref(false);
const router = useRouter();
const userInfo = useUserInfo();

const handleLogin = () => {
	loading.value = true;
	request
		.post('/auth/login', form)
		.then((res: any) => {
			userInfo.setToken(res.token);
			userInfo.setUserInfo(res.username, res.roles || ['user']);
			ElMessage.success('登录成功');
			router.push('/home');
		})
		.catch(() => ElMessage.error('登录失败'))
		.finally(() => (loading.value = false));
};
</script>

<style scoped lang="scss">
.login-container {
	height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--login-grad);
	transition: background 0.25s;
}
.login-box {
	width: min(380px, calc(100vw - 32px)); // 小屏不溢出
	padding: 40px;
	background: var(--card-bg);
	border-radius: 12px;
	box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
	.login-brand {
		display: flex;
		justify-content: center;
		margin-bottom: 14px;
	}
	h2 {
		text-align: center;
		margin-bottom: 8px;
		color: var(--ink);
	}
	.login-sub {
		text-align: center;
		font-size: 13px;
		color: var(--ink-low);
		margin: 0 0 26px;
		letter-spacing: 1px;
	}
	.login-btn {
		width: 100%;
	}
}
</style>
