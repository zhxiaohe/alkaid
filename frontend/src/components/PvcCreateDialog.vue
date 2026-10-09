<template>
	<el-dialog v-model="visible" title="新建存储卷（PVC）" width="560px" :close-on-click-modal="false" @open="onOpen">
		<el-form label-width="96px" size="default" @submit.prevent>
			<el-form-item label="命名空间" required>
				<el-select
					v-if="!lockNamespace"
					v-model="fd.namespace"
					filterable
					allow-create
					default-first-option
					placeholder="选择已有或输入新命名空间（DNS-1123 小写）"
					style="width: 100%"
				>
					<el-option v-for="ns in nsSuggestions" :key="ns" :label="ns" :value="ns" />
				</el-select>
				<el-input v-else :model-value="fd.namespace" disabled />
				<div class="form-tip">PVC 不能跨命名空间挂载：推理服务只能用与其同 ns 的盘</div>
			</el-form-item>
			<el-form-item label="名称" required>
				<el-input v-model="fd.name" placeholder="小写字母/数字/中划线，如 weights-qwen-7b" maxlength="253" />
			</el-form-item>
			<el-form-item label="StorageClass" required>
				<el-select v-model="fd.storage_class" style="width: 100%" placeholder="选择存储类" @change="onSCChange">
					<el-option v-for="sc in scList" :key="sc.name" :label="scLabel(sc)" :value="sc.name" />
				</el-select>
				<div v-if="scWarn" class="form-tip" style="color: var(--el-color-warning)">{{ scWarn }}</div>
				<div v-if="scInfo" class="form-tip">{{ scInfo }}</div>
			</el-form-item>
			<el-form-item label="容量（Gi）" required>
				<el-input-number v-model="fd.capacity_gb" :min="1" :max="65536" :step="10" :precision="0" style="width: 200px" />
				<span class="form-tip" style="margin-left: 10px">1 Gi = 1024 Mi；多数存储类创建后不可缩容</span>
			</el-form-item>
			<el-form-item label="访问模式" required>
				<el-checkbox-group v-model="fd.access_modes">
					<el-checkbox label="RWO">单节点读写</el-checkbox>
					<el-checkbox label="ROX" :disabled="!scROX">多节点只读</el-checkbox>
					<el-checkbox label="RWX" :disabled="!scRWX">多节点共享读写</el-checkbox>
				</el-checkbox-group>
				<div class="form-tip">
					共享权重盘（多副本/跨节点）需要 ROX 或 RWX；当前所选存储类不支持时选项置灰——强选会在集群侧停在 Pending
				</div>
				<div v-if="noSharedSC" class="form-tip" style="color: var(--el-color-warning)">
					当前集群未提供任何共享存储类（无 RWX/ROX）：建出的卷只能单节点读写，多副本须落在同一节点。
					跨节点共享需要集群侧先安装 NFS/CephFS 类 CSI——装好后这里会自动出现，平台侧无需改动。
				</div>
			</el-form-item>
			<!-- 模型上下文：从模型详情页发起时，声明该卷承载的权重来源（创建成功后自动建立模型-卷绑定） -->
			<template v-if="model">
				<el-form-item label="权重来源" required>
					<el-radio-group v-model="fd.storage_type">
						<el-radio-button label="s3">S3 预热目标</el-radio-button>
						<el-radio-button label="nas">NAS 缓存直通</el-radio-button>
					</el-radio-group>
					<div class="form-tip">
						{{ storageTypeTip }}
					</div>
				</el-form-item>
				<el-form-item label="落盘目录">
					<el-input v-model="fd.dest_dir" :placeholder="`留空默认 ${modelDir}`" style="width: 320px" />
					<div class="form-tip">权重在卷内的相对目录，与推理挂载 /models/{目录}/{版本} 口径一致</div>
				</el-form-item>
			</template>
		</el-form>
		<template #footer>
			<el-button @click="visible = false">取消</el-button>
			<el-button type="primary" :loading="submitting" @click="submit">
				{{ phase === 'binding' ? '等待集群回填并关联…' : `创建${model ? '并绑定' : ''}` }}
			</el-button>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
// PVC 创建对话框：集群管理「存储」页（主入口）、推理服务「就地新建」与模型详情「新建存储卷并绑定」共用。
// 都走同一个权威 API（POST /api/cluster/pvcs），平台侧不出现第二个权威源。
//
// 携带 model 上下文时（模型详情入口），创建成功后自动建立「模型-存储卷」绑定（bindModelVolume）。
// 顺序有讲究：BindModelVolume 会校验「卷必须已在集群镜像表中」（否则 41216），而镜像是 syncer
// 事件驱动回填的——创建后立刻绑定会被拒，故先轮询镜像可见再绑定。
//
// 「权重来源 s3/nas」是语义标签（落 model_volume.storage_type），不是卷的物理类型：卷的类型只由
// StorageClass + provisioner 决定。S3 是对象存储，永远不会成为 StorageClass，它靠「预热」把权重灌进卷；
// NAS 则要求集群侧真的提供 NFS/CephFS 类存储类——本页按集群实际 SC 列表展示，平台侧不写死。
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { createClusterPVC, getClusterPVCs, getStorageClasses, type ClusterPVCItem, type StorageClassItem } from '/@/api/cluster';
import { bindModelVolume } from '/@/api/model';

const props = defineProps<{
	modelValue: boolean;
	namespace: string; // 初始命名空间（服务侧为服务 ns，存储页可为空由用户选）
	lockNamespace?: boolean; // 服务侧锁定为服务自身 ns
	defaultName?: string; // 默认名称（如 pvc-<服务名>）
	nsSuggestions?: string[]; // 命名空间建议（存储页传入镜像表已有的 ns）
	model?: string; // 模型上下文（模型详情页入口）：创建成功后自动绑定
	modelDir?: string; // 模型目录名（dest_dir 默认值提示，取 cache_nas/local_path basename）
}>();
const emit = defineEmits<{
	(e: 'update:modelValue', v: boolean): void;
	(e: 'created', pvc: { namespace: string; name: string }): void;
}>();

const visible = computed({
	get: () => props.modelValue,
	set: (v: boolean) => emit('update:modelValue', v),
});

const fd = reactive({
	namespace: '',
	name: '',
	storage_class: '',
	capacity_gb: 50,
	access_modes: ['RWO'] as string[],
	storage_type: 's3' as 's3' | 'nas',
	dest_dir: '',
});
const scList = ref<StorageClassItem[]>([]);
const submitting = ref(false);
// 提交阶段提示：binding = 卷已建好，正在等镜像回填并建立模型关联（回填有事件延迟，按钮文案要说明在等什么）
const phase = ref<'' | 'binding'>('');

// 「权重来源」是语义标签（落 model_volume.storage_type），不改变卷的物理类型
const storageTypeTip = computed(() =>
	fd.storage_type === 's3'
		? '本卷作为 S3 权重的灌数目标：创建后到模型版本行发起「预热」，把 s3:// 权重同步进来。S3 是对象存储、不会是一个存储类，卷的物理类型仍由上方 StorageClass 决定'
		: '本卷按 NAS/NFS 共享目录使用（缓存直通，无需预热）。前提是所选 StorageClass 本身是 NFS/CephFS 类：集群没装对应 CSI 时，本机盘不会因为选了这一项就变成 NAS'
);

// 全环境无共享存储类：这不是平台限制，而是集群侧没提供。
// 装了 NFS/CephFS CSI 后 SC 列表会自动出现并支持 RWX，平台侧无需改代码——这里只把事实讲清楚，
// 否则用户会读成「平台不支持 NAS / 多副本」。
const noSharedSC = computed(() => scList.value.length > 0 && !scList.value.some((s) => s.rwx || s.rox));

const selectedSC = computed(() => scList.value.find((s) => s.name === fd.storage_class) || null);
const scRWX = computed(() => !!selectedSC.value?.rwx);
const scROX = computed(() => !!selectedSC.value?.rox);

const scLabel = (sc: StorageClassItem) => {
	const cap = sc.rwx ? 'RWX' : sc.rox ? 'ROX' : 'RWO';
	return `${sc.name}（${cap}${sc.is_default ? ' · 默认' : ''}）`;
};

// 能力未知 = 静态映射表没收录该 provisioner：不做硬拦截，但明确告知风险
const scWarn = computed(() => {
	if (!selectedSC.value || selectedSC.value.capability_known) return '';
	return '该存储类的 provisioner 未能识别，仅 RWO 有保证；其余模式可能停在 Pending，创建后请在列表确认状态';
});
const scInfo = computed(() => {
	const sc = selectedSC.value;
	if (!sc) return '';
	const bits = [`provisioner: ${sc.provisioner}`, `回收: ${sc.reclaim_policy || '—'}`];
	if (sc.allow_volume_expansion) bits.push('支持扩容');
	return bits.join(' · ');
});

// SC 切换后剔除已不支持的模式，避免提交一个注定 Pending 的组合
const onSCChange = () => {
	if (scRWX.value && scROX.value) return;
	fd.access_modes = fd.access_modes.filter((m) => m === 'RWO' || (m === 'RWX' ? scRWX.value : scROX.value));
	if (!fd.access_modes.length) fd.access_modes = ['RWO'];
};
watch(scRWX, onSCChange);
watch(scROX, onSCChange);

const onOpen = async () => {
	fd.namespace = props.namespace || '';
	fd.name = props.defaultName || '';
	fd.capacity_gb = 50;
	fd.access_modes = ['RWO'];
	fd.storage_class = '';
	fd.storage_type = 's3';
	fd.dest_dir = '';
	scList.value = [];
	try {
		const res: any = await getStorageClasses();
		scList.value = res?.list ?? [];
		// 默认选中集群默认 SC（有标注时），减少一次点选
		fd.storage_class = scList.value.find((s) => s.is_default)?.name || scList.value[0]?.name || '';
	} catch {
		/* 拦截器已提示（多为集群未接入） */
	}
};

// 名称与后端同规：DNS-1123 subdomain
const nameOk = (s: string) => /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(s);

// 等待集群镜像回填：PVC 创建成功后 cluster_pvc 由 syncer 事件写入（事件驱动，最坏 30s resync 兜底），
// 而 BindModelVolume 校验「卷必须已在镜像表中」，不等就会拿到 41216 的假失败。
// 竞态窗口内 bind 接口本身没有可重试语义（每次失败都会弹错误提示），故改为轮询只读列表探活，
// 不产生任何错误提示；超时则明确告知用户去「绑定已有存储卷」补一步，不静默吞掉。
const waitPVCMirrored = async (ns: string, name: string, timeoutMs = 20000): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			const res: any = await getClusterPVCs({ namespace: ns, keyword: name, size: 50 });
			const list: ClusterPVCItem[] = res?.list ?? [];
			if (list.some((p) => p.namespace === ns && p.name === name)) return true;
		} catch {
			/* 列表查询失败不中断：继续重试到超时 */
		}
		if (Date.now() >= deadline) return false;
		await new Promise((r) => setTimeout(r, 1500));
	}
};

const submit = async () => {
	if (!fd.namespace || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(fd.namespace)) {
		ElMessage.warning('请填写合法命名空间（小写字母/数字/中划线）');
		return;
	}
	if (!fd.name || !nameOk(fd.name)) {
		ElMessage.warning('请填写合法名称（小写字母开头，仅含小写字母/数字/中划线/点）');
		return;
	}
	if (!fd.storage_class) {
		ElMessage.warning('请选择 StorageClass');
		return;
	}
	if (!fd.capacity_gb || fd.capacity_gb < 1) {
		ElMessage.warning('容量至少 1 Gi');
		return;
	}
	if (!fd.access_modes.length) {
		ElMessage.warning('请至少选择一个访问模式');
		return;
	}
	submitting.value = true;
	const withModel = !!props.model;
	const pvc = { namespace: fd.namespace, name: fd.name };
	// dest_dir 口径与后端一致：空 = 卷内的 {模型目录}，故留空即不传该字段的实值
	const destDir = fd.dest_dir.trim().replace(/^\/+|\/+$/g, '');
	try {
		await createClusterPVC({
			namespace: pvc.namespace,
			name: pvc.name,
			storage_class: fd.storage_class,
			capacity_gb: fd.capacity_gb,
			access_modes: [...fd.access_modes],
		});
		if (withModel) {
			// 模型上下文：创建后立刻建立「模型-存储卷」绑定（此前这一步缺失，导致卷建了但账本为空）
			phase.value = 'binding';
			if (!(await waitPVCMirrored(pvc.namespace, pvc.name))) {
				ElMessage.warning(
					`存储卷 ${pvc.namespace}/${pvc.name} 已创建，但集群镜像尚未回填，暂未建立模型关联。` +
						`请在模型详情「关联存储卷」用「绑定已有存储卷」补上（关联不影响卷本身与其中数据）`
				);
			} else {
				await bindModelVolume({
					model: props.model as string,
					namespace: pvc.namespace,
					pvc_name: pvc.name,
					storage_type: fd.storage_type,
					dest_dir: destDir || undefined,
				});
				ElMessage.success(`存储卷 ${pvc.namespace}/${pvc.name} 已创建并关联到模型 ${props.model}`);
			}
		} else {
			ElMessage.success(`存储卷 ${pvc.namespace}/${pvc.name} 已提交创建（Bound 需要片刻，列表会自动刷新）`);
		}
		emit('created', pvc);
		visible.value = false;
	} catch {
		/* 拦截器已提示具体原因（41217/41218/41219/41220）；绑定失败时卷已创建，提示见上 */
	} finally {
		submitting.value = false;
		phase.value = '';
	}
};
</script>
