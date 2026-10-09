<template>
	<div>
		<el-alert
			v-if="!envStore.hasSelected"
			title="请先在顶部选择环境（存储类属于该环境对应的集群），再管理存储类"
			type="info"
			:closable="false"
			show-icon
			class="m-b-15"
		/>

		<template v-else>
			<el-alert
				title="StorageClass 是集群级（非命名空间）资源：provisioner 决定卷的物理类型，平台只做受限管理。删除有三重守卫——仅平台创建、非默认、无存储卷引用"
				type="info"
				:closable="false"
				show-icon
				class="m-b-15"
			/>

			<div class="flex-between m-b-15">
				<div class="flex align-center">
					<el-button :icon="Refresh" @click="load">刷新</el-button>
					<el-button v-if="userInfo.isAdmin" type="primary" :icon="Plus" @click="openCreate">新建存储类</el-button>
				</div>
				<span v-if="!userInfo.isAdmin" class="text-muted" style="font-size: 12px">存储类管理仅管理员可用，当前为只读视图</span>
			</div>

			<!-- 无共享存储类时的引导：这是集群侧缺 CSI，不是平台不支持 -->
			<el-alert
				v-if="!loading && list.length > 0 && !hasShared"
				title="当前环境没有任何支持 RWX/ROX 的存储类：多副本共享权重盘需要 NFS/CephFS 类驱动，请在集群侧安装对应 CSI 并定义 StorageClass（装好后此处与新建存储卷下拉会自动出现，平台侧无需改动）"
				type="warning"
				:closable="false"
				show-icon
				class="m-b-15"
			/>

			<el-table :data="list" border stripe v-loading="loading" empty-text="该环境暂无存储类；请先在集群侧安装 CSI 并定义 StorageClass">
				<el-table-column label="名称" min-width="190">
					<template #default="{ row }">
						<span class="sc-name">{{ row.name }}</span>
						<el-tag v-if="row.is_default" size="small" type="success" effect="plain" class="m-l-5">默认</el-tag>
						<el-tag v-if="row.platform_created" size="small" type="warning" effect="plain" class="m-l-5">平台创建</el-tag>
					</template>
				</el-table-column>
				<el-table-column prop="provisioner" label="Provisioner（CSI 驱动）" min-width="230" show-overflow-tooltip />
				<el-table-column label="访问能力" width="180">
					<template #default="{ row }">
						<el-tag :type="row.rwx ? 'success' : row.rox ? 'info' : 'warning'" size="small" effect="plain">
							{{ row.rwx ? 'RWX 多节点读写' : row.rox ? 'ROX 多节点只读' : 'RWO 单节点读写' }}
						</el-tag>
						<el-tooltip
							v-if="!row.capability_known"
							content="该 provisioner 不在平台能力映射表中：仅 RWO 有保证，其余访问模式可能停在 Pending"
							placement="top"
						>
							<el-tag size="small" type="info" effect="plain" class="m-l-5">能力未知</el-tag>
						</el-tooltip>
					</template>
				</el-table-column>
				<el-table-column label="回收策略" width="110" align="center">
					<template #default="{ row }">
						<el-tooltip
							:content="row.reclaim_policy === 'Retain' ? '删 PVC 后底层卷与数据保留' : '删 PVC 会连带删除底层数据'"
							placement="top"
						>
							<el-tag :type="row.reclaim_policy === 'Retain' ? 'success' : 'danger'" size="small" effect="plain">
								{{ row.reclaim_policy || '—' }}
							</el-tag>
						</el-tooltip>
					</template>
				</el-table-column>
				<el-table-column label="可扩容" width="90" align="center">
					<template #default="{ row }">{{ row.allow_volume_expansion ? '是' : '否' }}</template>
				</el-table-column>
				<el-table-column label="绑定模式" min-width="170">
					<template #default="{ row }">
						{{ row.volume_binding_mode === 'WaitForFirstConsumer' ? '延迟绑定（等 Pod 调度）' : row.volume_binding_mode || '—' }}
					</template>
				</el-table-column>
				<el-table-column label="操作" width="110" align="center">
					<template #default="{ row }">
						<el-tooltip
							v-if="!row.platform_created"
							content="集群侧 YAML 定义的存储类，请在集群侧管理"
							placement="top"
						>
							<el-button link type="info" disabled>不可删</el-button>
						</el-tooltip>
						<el-button v-else link type="danger" @click="remove(row)">删除</el-button>
					</template>
				</el-table-column>
			</el-table>

			<div class="text-muted m-t-10" style="font-size: 12px; line-height: 1.6">
				访问能力（RWX/ROX）不在 StorageClass 里声明——能力由 provisioner 实现决定，K8s 无查询接口，此处为平台映射表标注。
				权重盘建议 Retain（删卷不删数据）；Delete 的存储类上建盘，删 PVC 即删数据。
			</div>

			<!-- 新建存储类（仅管理员）：provisioner 已知则出参数字段，未知走自定义键值 -->
			<el-dialog v-model="createVisible" title="新建存储类" width="620px" :close-on-click-modal="false">
				<el-form label-width="130px">
					<el-form-item label="名称" required>
						<el-input v-model="fd.name" placeholder="如 nfs-models / cephfs-weights（小写字母数字，可含 - 与 .）" />
						<div class="form-tip">集群级唯一；小写字母开头，仅含小写字母/数字/中划线/点</div>
					</el-form-item>
					<el-form-item label="Provisioner" required>
						<el-select v-model="fd.provisioner" placeholder="选择 CSI 驱动（provisioner）" style="width: 100%">
							<el-option v-for="p in PROVISIONER_PRESETS" :key="p.value" :label="p.label" :value="p.value" />
							<el-option label="其他 / 自定义（手工填 provisioner 与参数）" :value="CUSTOM" />
						</el-select>
						<div class="form-tip">决定卷的物理类型，必须与集群已安装的 CSI 驱动一致</div>
					</el-form-item>

					<template v-if="fd.provisioner === CUSTOM">
						<el-form-item label="provisioner" required>
							<el-input v-model="fd.customProvisioner" placeholder="如 driver.longhorn.io" />
						</el-form-item>
						<el-form-item label="参数">
							<div style="width: 100%">
								<div v-for="(p, i) in fd.customParams" :key="i" class="flex align-center m-b-5">
									<el-input v-model="p.k" placeholder="键" style="width: 40%; margin-right: 8px" />
									<el-input v-model="p.v" placeholder="值" style="width: 45%; margin-right: 8px" />
									<el-button link type="danger" @click="fd.customParams.splice(i, 1)">移除</el-button>
								</div>
								<el-button link type="primary" @click="fd.customParams.push({ k: '', v: '' })">+ 添加参数</el-button>
							</div>
						</el-form-item>
					</template>
					<template v-else-if="activePreset">
						<el-form-item v-for="f in activePreset.fields" :key="f.key" :label="f.label" :required="!!f.required">
							<el-input v-model="fd.params[f.key]" :placeholder="f.placeholder || ''" />
						</el-form-item>
					</template>

					<el-form-item label="回收策略">
						<el-radio-group v-model="fd.reclaim_policy">
							<el-radio-button label="Retain">Retain（保留数据）</el-radio-button>
							<el-radio-button label="Delete">Delete（删卷即删数据）</el-radio-button>
						</el-radio-group>
						<div v-if="fd.reclaim_policy === 'Delete'" class="form-tip danger-tip">
							危险：删 PVC 会连带删除底层数据，仅适合可再生的临时盘
						</div>
						<div v-else class="form-tip">权重盘默认 Retain：删 PVC 后底层卷与数据保留，需要人工清理</div>
					</el-form-item>
					<el-form-item label="允许扩容">
						<el-switch v-model="fd.allow_volume_expansion" />
						<div class="form-tip">允许后续在线扩容（实际是否生效取决于 provisioner 支持情况）</div>
					</el-form-item>
					<el-form-item label="绑定模式">
						<el-radio-group v-model="fd.volume_binding_mode">
							<el-radio-button label="Immediate">Immediate（立即绑定）</el-radio-button>
							<el-radio-button label="WaitForFirstConsumer">延迟绑定</el-radio-button>
						</el-radio-group>
						<div class="form-tip">延迟绑定在 Pod 调度后才创建卷，可避免卷与节点拓扑冲突（本地盘类建议选它）</div>
					</el-form-item>
					<el-form-item label="挂载参数">
						<el-input v-model="fd.mount_options" placeholder="逗号分隔，如 nfsvers=4.1,hard；留空不设置" />
					</el-form-item>
				</el-form>
				<template #footer>
					<el-button @click="createVisible = false">取消</el-button>
					<el-button type="primary" :loading="submitting" @click="submit">创建</el-button>
				</template>
			</el-dialog>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { createStorageClass, deleteStorageClass, getStorageClasses, type StorageClassItem } from '/@/api/cluster';
import { useEnvStore } from '/@/stores/env';
import { useUserInfo } from '/@/stores/userInfo';

const envStore = useEnvStore();
const userInfo = useUserInfo();

const loading = ref(false);
const list = ref<StorageClassItem[]>([]);
const createVisible = ref(false);
const submitting = ref(false);

// 是否有任何支持共享读写的存储类（RWX/ROX）；没有时页面顶部给集群侧引导
const hasShared = computed(() => list.value.some((s) => s.rwx || s.rox));

// provisioner 预设：已知驱动的参数是固定几项，直接出表单，避免用户凭记忆手填 CSI 参数
interface ParamField {
	key: string;
	label: string;
	required?: boolean;
	placeholder?: string;
}
interface Preset {
	value: string;
	label: string;
	fields: ParamField[];
}

const CUSTOM = '__custom__';

const PROVISIONER_PRESETS: Preset[] = [
	{
		value: 'nfs.csi.k8s.io',
		label: 'NFS（nfs.csi.k8s.io）',
		fields: [
			{ key: 'server', label: 'NFS 服务端地址', required: true, placeholder: '10.19.x.x' },
			{ key: 'share', label: '导出路径 share', required: true, placeholder: '/export/models' },
		],
	},
	{
		value: 'nfs-subdir-external-provisioner',
		label: 'NFS 子目录（nfs-subdir-external-provisioner）',
		fields: [
			{ key: 'server', label: 'NFS 服务端地址', required: true, placeholder: '10.19.x.x' },
			{ key: 'path', label: '导出路径 path', required: true, placeholder: '/export/models' },
		],
	},
	{
		value: 'cephfs.csi.ceph.com',
		label: 'CephFS（cephfs.csi.ceph.com）',
		fields: [
			{ key: 'monitors', label: 'MON 地址（逗号分隔）', required: true, placeholder: '10.19.x.x:6789,10.19.x.y:6789' },
			{ key: 'clusterID', label: '集群 ID', required: true },
			{ key: 'fsName', label: '文件系统名', placeholder: '留空用 cephfs' },
		],
	},
	{
		value: 'rbd.csi.ceph.com',
		label: 'Ceph RBD（rbd.csi.ceph.com）',
		fields: [
			{ key: 'monitors', label: 'MON 地址（逗号分隔）', required: true },
			{ key: 'clusterID', label: '集群 ID', required: true },
			{ key: 'pool', label: '存储池 pool', required: true },
		],
	},
	{
		value: 'driver.longhorn.io',
		label: 'Longhorn（driver.longhorn.io）',
		fields: [{ key: 'numberOfReplicas', label: '副本数', placeholder: '3' }],
	},
];

const activePreset = computed(() => PROVISIONER_PRESETS.find((p) => p.value === fd.provisioner));

const fd = reactive({
	name: '',
	provisioner: '',
	customProvisioner: '',
	params: {} as Record<string, string>,
	customParams: [] as { k: string; v: string }[],
	reclaim_policy: 'Retain' as 'Retain' | 'Delete',
	allow_volume_expansion: true,
	volume_binding_mode: 'Immediate' as 'Immediate' | 'WaitForFirstConsumer',
	mount_options: '',
});

const openCreate = () => {
	fd.name = '';
	fd.provisioner = '';
	fd.customProvisioner = '';
	fd.params = {};
	fd.customParams = [{ k: '', v: '' }];
	fd.reclaim_policy = 'Retain';
	fd.allow_volume_expansion = true;
	fd.volume_binding_mode = 'Immediate';
	fd.mount_options = '';
	createVisible.value = true;
};

const load = async () => {
	if (!envStore.hasSelected) return;
	loading.value = true;
	try {
		const res: any = await getStorageClasses();
		list.value = res?.list ?? [];
	} catch {
		list.value = [];
	} finally {
		loading.value = false;
	}
};

// 名称与后端同规：DNS-1123 subdomain
const nameOk = (s: string) => /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(s);

const submit = async () => {
	if (!fd.name || !nameOk(fd.name)) {
		ElMessage.warning('请填写合法名称（小写字母开头，仅含小写字母/数字/中划线/点）');
		return;
	}
	const provisioner = fd.provisioner === CUSTOM ? fd.customProvisioner.trim() : fd.provisioner;
	if (!provisioner) {
		ElMessage.warning('请选择或填写 provisioner');
		return;
	}
	// 参数：预设驱动按字段取值；自定义走键值对，空键值丢弃
	const parameters: Record<string, string> = {};
	if (fd.provisioner === CUSTOM) {
		for (const p of fd.customParams) {
			if (p.k.trim() && p.v.trim()) parameters[p.k.trim()] = p.v.trim();
		}
	} else {
		for (const f of activePreset.value?.fields || []) {
			const v = (fd.params[f.key] || '').trim();
			if (!v) {
				if (f.required) {
					ElMessage.warning(`请填写「${f.label}」`);
					return;
				}
				continue;
			}
			parameters[f.key] = v;
		}
	}
	submitting.value = true;
	try {
		const res: any = await createStorageClass({
			name: fd.name,
			provisioner,
			parameters,
			reclaim_policy: fd.reclaim_policy,
			allow_volume_expansion: fd.allow_volume_expansion,
			volume_binding_mode: fd.volume_binding_mode,
			mount_options: fd.mount_options
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean),
		});
		ElMessage.success(`存储类 ${fd.name} 已创建`);
		// CSIDriver 缺失等非致命问题由后端以 warning 带回：创建成功但可能停 Pending
		const warnings: string[] = res?.warnings ?? [];
		if (warnings.length) ElMessage.warning(warnings.join('；'));
		createVisible.value = false;
		load();
	} catch {
		/* 拦截器已提示具体原因（41228 参数不合法 / 41229 同名已存在 / 41234 创建失败） */
	} finally {
		submitting.value = false;
	}
};

// 删除：仅平台创建的 SC（按钮已按 platform_created 控制），再要求输入名称确认一次
const remove = async (row: StorageClassItem) => {
	try {
		await ElMessageBox.prompt(`此操作不可恢复。请输入存储类名称「${row.name}」以确认删除`, '删除存储类', {
			confirmButtonText: '确认删除',
			cancelButtonText: '取消',
			inputValidator: (v: string) => v === row.name || '名称不一致，未执行删除',
		});
	} catch {
		return; // 用户取消
	}
	try {
		await deleteStorageClass(row.name);
		ElMessage.success(`存储类 ${row.name} 已删除`);
		load();
	} catch {
		/* 拦截器提示：41231 非平台创建 / 41232 仍被存储卷引用 / 41233 默认存储类 / 41235 删除失败 */
	}
};

onMounted(load);

// 环境切换联动：存储类属于该环境对应的集群（后端按 X-ENV-ID 取该环境的 k8s 客户端），
// 切换后必须重载，否则列表停留在上一个环境的存储类。load() 内部已按 hasSelected 兜底。
watch(() => envStore.envId, () => load());
</script>

<style scoped>
.sc-name {
	font-weight: 500;
}
.form-tip {
	font-size: 12px;
	color: var(--el-text-color-secondary);
	line-height: 1.5;
	margin-top: 4px;
}
.danger-tip {
	color: var(--el-color-danger);
}
.m-b-5 {
	margin-bottom: 5px;
}
</style>
