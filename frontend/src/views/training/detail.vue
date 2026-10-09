<template>
	<div v-loading="loading">
		<el-page-header @back="router.back()" class="m-b-15">
			<template #content>
				<span class="page-title">{{ detail.name || name }}</span>
				<el-tag v-if="detail.status" :type="statusType(detail.status)" size="small" class="m-l-10">{{ detail.status }}</el-tag>
			</template>
		</el-page-header>

		<el-tabs v-model="activeTab" class="m-t-10">
			<el-tab-pane label="概览" name="overview">
				<el-descriptions :column="3" border>
					<el-descriptions-item label="任务名">{{ detail.name }}</el-descriptions-item>
					<el-descriptions-item label="基座模型">{{ detail.base_model }}</el-descriptions-item>
					<el-descriptions-item label="微调方法">{{ detail.method }}</el-descriptions-item>
					<el-descriptions-item label="数据集" :span="2">{{ detail.dataset }}</el-descriptions-item>
					<el-descriptions-item label="GPU 数">{{ detail.gpu_count }} × {{ detail.gpu_type }}</el-descriptions-item>
					<el-descriptions-item label="开始时间">{{ detail.start_at }}</el-descriptions-item>
					<el-descriptions-item label="结束时间">{{ detail.end_at || '—' }}</el-descriptions-item>
					<el-descriptions-item label="MLflow Run">
						<el-link v-if="detail.mlflow_run_id" type="primary" @click="openMLflow">{{ detail.mlflow_run_id }}</el-link>
						<span v-else>—</span>
					</el-descriptions-item>
				</el-descriptions>
				<div class="m-t-15" v-if="['Running', 'Pending'].includes(detail.status)">
					<el-button type="warning" :icon="VideoPause" @click="handleStop">停止任务</el-button>
				</div>
			</el-tab-pane>

			<el-tab-pane label="日志" name="logs">
				<div class="flex-between m-b-10">
					<span class="log-tip">训练日志快照（MVP 只读，后续接 SSE 实时流）</span>
					<el-button :icon="Refresh" size="small" @click="loadLogs">刷新</el-button>
				</div>
				<div class="log-box" v-loading="logsLoading">
					<pre v-for="(line, i) in logs" :key="i">{{ line }}</pre>
					<el-empty v-if="!logs.length && !logsLoading" description="无日志" />
				</div>
			</el-tab-pane>

			<el-tab-pane label="MLflow" name="mlflow">
				<div v-loading="mlflowLoading">
					<el-link v-if="mlflowUrl" type="primary" :href="mlflowUrl" target="_blank">
						<el-icon><Link /></el-icon>
						在 MLflow 中打开实验追踪
					</el-link>
					<el-empty v-else description="无 MLflow 链接" />
				</div>
			</el-tab-pane>
		</el-tabs>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh, VideoPause, Link } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '/@/api/training';
import { useEnvStore } from '/@/stores/env';

const route = useRoute();
const router = useRouter();
const name = ref(String(route.params.name || ''));
const envStore = useEnvStore();

const loading = ref(false);
const detail = ref<any>({});
const activeTab = ref('overview');

const logsLoading = ref(false);
const logs = ref<string[]>([]);
const mlflowLoading = ref(false);
const mlflowUrl = ref('');

const statusType = (s: string) =>
	({ Succeeded: 'success', Failed: 'danger', Running: 'warning', Pending: 'info', Stopped: 'info' } as Record<string, string>)[s] || 'info';

const loadDetail = async () => {
	loading.value = true;
	try {
		detail.value = await api.getTrainingDetail(name.value);
	} finally {
		loading.value = false;
	}
};
const loadLogs = async () => {
	logsLoading.value = true;
	try {
		logs.value = await api.getTrainingLogs(name.value);
	} finally {
		logsLoading.value = false;
	}
};
const loadMLflow = async () => {
	mlflowLoading.value = true;
	try {
		const r: any = await api.getTrainingMlflowUrl(name.value);
		mlflowUrl.value = r?.url || '';
	} finally {
		mlflowLoading.value = false;
	}
};
const openMLflow = () => {
	if (mlflowUrl.value) window.open(mlflowUrl.value, '_blank');
	else loadMLflow().then(() => mlflowUrl.value && window.open(mlflowUrl.value, '_blank'));
};

const handleStop = () => {
	ElMessageBox.confirm(`确认停止训练任务 ${name.value}？`, '提示', { type: 'warning' })
		.then(async () => {
			await api.stopTraining(name.value);
			ElMessage.success('停止已提交');
			loadDetail();
		})
		.catch(() => {});
};

watch(activeTab, (t) => {
	if (t === 'logs' && !logs.value.length) loadLogs();
	if (t === 'mlflow' && !mlflowUrl.value) loadMLflow();
});

// 环境切换联动：训练任务详情/日志/MLflow 地址均属当前环境（后端按 X-ENV-ID 隔离）。
// 切环境后清空旧环境数据并按当前 Tab 重载，避免停留在上一个环境的任务详情。
watch(
	() => envStore.envId,
	(nv, ov) => {
		if (!nv || nv === ov) return;
		detail.value = {};
		logs.value = [];
		mlflowUrl.value = '';
		loadDetail();
		if (activeTab.value === 'logs') loadLogs();
		if (activeTab.value === 'mlflow') loadMLflow();
	}
);

onMounted(loadDetail);
</script>

<style scoped lang="scss">
.page-title {
	font-size: 16px;
	font-weight: 600;
}
.log-tip {
	font-size: 12px;
	color: #909399;
}
.log-box {
	background: #1e1e1e;
	color: #d4d4d4;
	padding: 12px;
	border-radius: 4px;
	max-height: 420px;
	overflow: auto;
	pre {
		margin: 0;
		font-family: 'Menlo', 'Consolas', monospace;
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
	}
}
</style>
