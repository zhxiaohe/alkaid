<template>
	<el-dialog v-model="visible" title="预热权重到存储卷（PVC）" width="560px" :close-on-click-modal="false" @open="onOpen">
		<el-form label-width="100px" size="default" @submit.prevent>
			<el-form-item label="模型版本">
				<el-tag type="success">{{ model }} @ {{ version }}</el-tag>
				<span class="form-tip" style="margin-left: 10px">源：{{ storagePath }}</span>
			</el-form-item>
			<el-form-item label="目标卷" required>
				<el-select v-model="pvcKey" filterable placeholder="选择本环境的存储卷" style="width: 100%" :loading="pvcLoading">
					<el-option v-for="p in pvcList" :key="`${p.namespace}/${p.name}`" :value="`${p.namespace}/${p.name}`"
						:label="`${p.namespace}/${p.name}（${p.phase} · ${fmtBytes(p.capacity_bytes || p.requested_bytes)} · ${p.access_modes || '未声明'}）`" />
				</el-select>
				<div class="form-tip">
					灌数 Job 会以<b>读写</b>方式挂载目标卷，按目录约定落盘 {{ destPreview }}；
					完成后推理服务挂载该卷即可按版本取权重
				</div>
			</el-form-item>
			<el-form-item v-if="pvcKey" label="落盘目录">
				<code class="dest-code">/models/{{ destPreview }}</code>
			</el-form-item>
		</el-form>
		<el-alert type="warning" :closable="false" show-icon
			title="需要目标命名空间预先存在 S3 凭证 Secret：model-warmup-s3（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 必填，AWS_ENDPOINT_URL / AWS_DEFAULT_REGION 可选）" />
		<template #footer>
			<el-button @click="visible = false">取消</el-button>
			<el-button type="primary" :loading="submitting" :disabled="!pvcKey" @click="submit">开始预热</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
// 预热弹窗：把模型版本 storage_path（s3://）灌数到目标 PVC。
// 目录口径与后端一致：{模型目录}/{版本目录}（模型目录 = cache_nas/local_path basename 回退模型名）。
// 依赖注入：PVC 列表来自集群只读镜像（getClusterPVCs）。
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { createWarmup } from '/@/api/model';
import { getClusterPVCs, type ClusterPVCItem } from '/@/api/cluster';

// 字节可读化（与集群存储页 fmtBytes 同口径）
const fmtBytes = (bytes?: number) => {
	if (!bytes || bytes <= 0) return '—';
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
	let v = bytes;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i += 1;
	}
	return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const props = defineProps<{
	modelValue: boolean;
	model: string;
	version: string;
	storagePath: string;
	cacheNas?: string;
	localPath?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'created'): void }>();

const visible = computed({
	get: () => props.modelValue,
	set: (v: boolean) => emit('update:modelValue', v),
});

const pvcList = ref<ClusterPVCItem[]>([]);
const pvcLoading = ref(false);
const pvcKey = ref('');
const submitting = ref(false);

// 落盘目录预览：与后端 warmupDestDir 同口径（口径变更须两侧同步）
const destPreview = computed(() => {
	const base = (p?: string) => (p || '').replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';
	const modelDir = base(props.cacheNas) || base(props.localPath) || props.model;
	return `${modelDir}/${(props.version || '').replace(/^\/+|\/+$/g, '')}`;
});

const loadPvcs = async () => {
	pvcLoading.value = true;
	try {
		const res: any = await getClusterPVCs({ size: 200 });
		pvcList.value = res?.list ?? [];
	} finally {
		pvcLoading.value = false;
	}
};

const onOpen = () => {
	pvcKey.value = '';
	loadPvcs();
};

const submit = async () => {
	const [namespace, pvcName] = pvcKey.value.split('/');
	if (!namespace || !pvcName) {
		ElMessage.warning('请选择目标存储卷');
		return;
	}
	submitting.value = true;
	try {
		await createWarmup({ model: props.model, version: props.version, namespace, pvc_name: pvcName });
		ElMessage.success('预热任务已下发集群（aws s3 sync 执行中）');
		visible.value = false;
		emit('created');
	} finally {
		submitting.value = false;
	}
};

// 切换模型版本时重置选择
watch(() => [props.model, props.version], () => (pvcKey.value = ''));
</script>

<style scoped lang="scss">
.form-tip {
	font-size: 12px;
	color: var(--ink-low, #909399);
	line-height: 1.5;
}
.dest-code {
	padding: 2px 8px;
	font-family: 'Menlo', 'Consolas', monospace;
	font-size: 12px;
	background: rgba(0, 0, 0, 0.05);
	border-radius: 4px;
}
</style>
