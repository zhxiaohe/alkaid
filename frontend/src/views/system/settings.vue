<template>
	<div>
		<el-card shadow="never">
			<template #header><el-icon><Tools /></el-icon> 系统设置</template>
			<el-form :model="form" label-width="160px" class="m-t-15">
				<el-divider content-position="left">基础配置</el-divider>
				<el-form-item label="平台名称">
					<el-input v-model="form.platformName" />
				</el-form-item>
				<el-form-item label="默认 GPU 类型">
					<el-select v-model="form.defaultGpu" style="width: 240px">
						<el-option label="A100-80G" value="A100-80G" />
						<el-option label="A10-24G" value="A10-24G" />
						<el-option label="H100-80G" value="H100-80G" />
					</el-select>
				</el-form-item>
				<el-form-item label="默认推理框架">
					<el-select v-model="form.defaultFramework" style="width: 240px">
						<el-option label="vLLM" value="vLLM" />
						<el-option label="SGLang" value="SGLang" />
					</el-select>
				</el-form-item>

				<el-divider content-position="left">外部服务</el-divider>
				<el-form-item label="服务树地址">
					<el-input v-model="form.servicetreeUrl" placeholder="https://servicetree.example.com" />
				</el-form-item>
				<el-form-item label="MLflow 地址">
					<el-input v-model="form.mlflowUrl" placeholder="http://mlflow.example.com:5000" />
				</el-form-item>
				<el-form-item label="Higress 网关地址">
					<el-input v-model="form.higressUrl" placeholder="https://ai.example.com" />
				</el-form-item>

				<el-divider content-position="left">日志 & 监控</el-divider>
				<el-form-item label="日志后端">
					<el-radio-group v-model="form.logBackend">
						<el-radio value="loki">Loki</el-radio>
						<el-radio value="elk">ELK</el-radio>
						<el-radio value="sls">SLS</el-radio>
					</el-radio-group>
				</el-form-item>
				<el-form-item label="监控后端">
					<el-radio-group v-model="form.metricsBackend">
						<el-radio value="prometheus">Prometheus</el-radio>
						<el-radio value="sls">SLS</el-radio>
					</el-radio-group>
				</el-form-item>

				<el-form-item>
					<el-button type="primary">保存设置</el-button>
					<el-button>重置</el-button>
				</el-form-item>
			</el-form>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
const form = reactive({
	platformName: 'AI 推理训练一体化运维平台',
	defaultGpu: 'A100-80G',
	defaultFramework: 'vLLM',
	servicetreeUrl: 'https://servicetree.example.com',
	mlflowUrl: 'http://mlflow.example.com:5000',
	higressUrl: 'https://ai.example.com',
	logBackend: 'loki',
	metricsBackend: 'prometheus',
});
</script>
