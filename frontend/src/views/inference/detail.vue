<template>
	<div v-loading="loading">
		<el-page-header @back="router.back()" class="m-b-10">
			<template #content>
				<span class="page-title">{{ detail.name || name }}</span>
				<el-tag v-if="detail.status" :type="statusTagType(detail.status)" size="small" class="m-l-10">{{ detail.status }}</el-tag>
			</template>
			<template #extra>
				<el-button type="primary" size="small" :loading="applying" :disabled="!detail.spec && !detail.resolved_spec" @click="onApply">下发到集群</el-button>
				<el-button type="primary" plain size="small" :disabled="!detail.resolved_spec" @click="yamlOpen = true">查看 K8s 清单</el-button>
			</template>
		</el-page-header>

		<el-tabs v-model="activeTab" class="m-t-10">
			<!-- 概览（分组结构与创建抽屉一致；旧记录缺契约字段时统一灰字"未配置"并提示补全途径） -->
			<el-tab-pane label="概览" name="overview">
				<div class="detail-card">
					<div class="detail-card__title">基础信息</div>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="服务名">{{ detail.name || '—' }}</el-descriptions-item>
						<el-descriptions-item label="命名空间"><DVal :v="detail.namespace" /></el-descriptions-item>
						<el-descriptions-item label="状态">
							<el-tag v-if="detail.status" :type="statusTagType(detail.status)" size="small">{{ detail.status }}</el-tag>
							<span v-else>—</span>
						</el-descriptions-item>
						<el-descriptions-item label="服务树节点">{{ treeNodeText }}</el-descriptions-item>
						<el-descriptions-item label="环境">{{ envName }}</el-descriptions-item>
						<el-descriptions-item label="创建时间"><DVal :v="detail.created_at" /></el-descriptions-item>
						<el-descriptions-item label="访问地址" :span="3">
							<el-link v-if="detail.endpoint" type="primary" :href="detail.endpoint" target="_blank">{{ detail.endpoint }}</el-link>
							<span v-else class="na-val" title="下发成功后自动生成">未生成（下发后显示）</span>
						</el-descriptions-item>
					</el-descriptions>
				</div>

				<div class="detail-card">
					<div class="detail-card__title">模型</div>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="模型"><DVal :v="detail.model" /></el-descriptions-item>
						<el-descriptions-item label="部署版本"><DVal :v="spec.model_version" /></el-descriptions-item>
						<el-descriptions-item label="对外模型名">
							<template v-if="servedName">
								{{ servedName }}<span v-if="servedName === detail.model" class="na-val">（同模型名）</span>
							</template>
							<span v-else class="na-val" title="未配置">未配置</span>
						</el-descriptions-item>
					</el-descriptions>
				</div>

				<div class="detail-card">
					<div class="detail-card__title">推理引擎</div>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="硬件平台"><DVal :v="spec.hardware_platform" /></el-descriptions-item>
						<el-descriptions-item label="引擎与版本">
							<span v-if="engineDisplay" class="mono">{{ engineDisplay }}</span>
							<DVal v-else :v="spec.engine_id || detail.framework" />
						</el-descriptions-item>
						<el-descriptions-item label="引擎参数">
							<span v-if="engineParams.length">{{ engineParams.length }} 组</span>
							<span v-else class="na-val" title="可在编辑抽屉中按引擎选择参数">未配置</span>
						</el-descriptions-item>
					</el-descriptions>
					<div v-if="engineParams.length" class="param-tags">
						<el-tag v-for="[k, v] in engineParams" :key="k" size="small" type="info" class="param-tag">
							{{ k }}<span class="param-tag__eq">=</span><b>{{ formatParamValue(v) }}</b>
						</el-tag>
					</div>
					<div v-else class="detail-fallback">该记录未包含引擎参数（契约 v1.1 之前创建，M1 落库后新服务可见）</div>
					<div v-if="(spec.extra_args || []).length" class="extra-args">
						<span class="extra-args__label">原生参数：</span>
						<code v-for="a in spec.extra_args" :key="a" class="extra-args__item">{{ a }}</code>
					</div>
				</div>

				<div class="detail-card">
					<div class="detail-card__title">
						启动命令
						<el-tag v-if="argvInfo" size="small" :type="argvInfo.entrypoint_source === 'platform' ? 'success' : 'info'" effect="plain" class="m-l-8">
							{{ argvInfo.entrypoint_source === 'platform' ? '平台指定 entrypoint' : '镜像自带 ENTRYPOINT' }}
						</el-tag>
						<el-button v-if="argvInfo" link type="primary" size="small" class="m-l-8" @click="copyArgv">复制</el-button>
					</div>
					<!-- 与 apply 同一条渲染路径：这里显示的就是真正会下发的命令（不是另拼的预览） -->
					<template v-if="argvInfo">
						<pre class="argv-box">{{ argvInfo.shell_line }}</pre>
						<div class="argv-meta">
							<span>镜像 <span class="mono">{{ argvInfo.image }}</span></span>
							<span>渲染器 <span class="mono">{{ argvInfo.renderer_version }}</span></span>
						</div>
						<el-alert
							v-if="argvInfo.entrypoint_source === 'image'"
							type="info"
							:closable="false"
							class="m-t-8"
						>
							<template #title>
								容器命令由<b>镜像自带的 ENTRYPOINT</b>决定（平台只追加下面这串参数）。
								如果该镜像没有 ENTRYPOINT/CMD，Pod 会起来但不会启动引擎 ——
								可在「平台管理-引擎镜像」为该行指定启动命令。
							</template>
						</el-alert>
					</template>
					<div v-else class="detail-fallback">
						{{ argvError || '启动命令加载中…' }}
					</div>
				</div>

				<div class="detail-card">
					<div class="detail-card__title">算力与副本</div>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="GPU/副本"><DVal :v="detail.gpu_per_replica" /></el-descriptions-item>
						<el-descriptions-item label="GPU 类型"><DVal :v="detail.gpu_type" /></el-descriptions-item>
						<el-descriptions-item label="GPU 共享"><DVal :v="shareModeText" /></el-descriptions-item>
						<el-descriptions-item v-if="spec.share_mode === 'hami'" label="单卡显存"><DVal :v="cardMemoryText" /></el-descriptions-item>
						<el-descriptions-item label="节点池"><DVal :v="poolName" /></el-descriptions-item>
						<el-descriptions-item label="副本数">
							{{ detail.replicas ?? '—' }}
							<el-tag v-if="spec.autoscale?.enabled" size="small" type="warning" class="m-l-5">KEDA 托管</el-tag>
						</el-descriptions-item>
						<el-descriptions-item label="弹性范围">{{ elasticRange }}</el-descriptions-item>
						<el-descriptions-item label="副本打散"><DVal :v="spreadText" /></el-descriptions-item>
						<el-descriptions-item label="拓扑打散">{{ spec.scheduling?.topology_key || '未启用' }}</el-descriptions-item>
					</el-descriptions>
				</div>

				<div class="detail-card">
					<div class="detail-card__title">容器</div>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="CPU 请求"><DVal :v="spec.cpu_request" /></el-descriptions-item>
						<el-descriptions-item label="内存请求"><DVal :v="spec.memory_request" /></el-descriptions-item>
						<el-descriptions-item label="/dev/shm"><DVal :v="spec.shm_size" /></el-descriptions-item>
						<el-descriptions-item label="权重挂载（/models，只读）">
							<span v-if="spec.model_cache_pvc">PVC：{{ spec.model_cache_pvc }}</span>
							<span v-else>hostPath：{{ spec.model_host_path || '/nas/models' }}{{ spec.model_host_path ? '' : '（渲染器默认）' }}</span>
						</el-descriptions-item>
						<el-descriptions-item label="镜像凭证">{{ spec.image_pull_secret || '节点默认' }}</el-descriptions-item>
						<el-descriptions-item label="环境变量 / 密钥引用">{{ (spec.envs || []).length }} / {{ (spec.env_secret_refs || []).length }} 项</el-descriptions-item>
					</el-descriptions>
				</div>

				<div class="detail-card">
					<div class="detail-card__title">探针与生命周期</div>
					<el-descriptions :column="3" border size="small">
						<el-descriptions-item label="探针端口"><DVal :v="probePortNum" /></el-descriptions-item>
						<el-descriptions-item label="启动超时预算"><DVal :v="startupTimeoutText" /></el-descriptions-item>
						<el-descriptions-item label="终止宽限期"><DVal :v="graceText" /></el-descriptions-item>
						<el-descriptions-item label="readiness（就绪）"><DVal :v="probeText('readiness')" /></el-descriptions-item>
						<el-descriptions-item label="liveness（存活）"><DVal :v="probeText('liveness')" /></el-descriptions-item>
						<el-descriptions-item label="模型预热">
							<span v-if="postStartCommand">已配置</span>
							<span v-else class="na-val" title="可在编辑抽屉配置 postStart 预热命令">未配置</span>
						</el-descriptions-item>
					</el-descriptions>
					<div v-if="postStartCommand" class="poststart">
						<div class="poststart__label">模型预热（postStart exec）</div>
						<pre class="poststart__cmd">{{ postStartCommand }}</pre>
					</div>
				</div>
			</el-tab-pane>

			<!-- 弹性策略（KEDA 自动/定时扩缩容，docs/推理服务-扩缩容设计-手动与KEDA自动定时.md §8） -->
			<el-tab-pane label="弹性策略" name="autoscale">
				<el-alert v-if="!kedaAvailable" type="warning" :closable="false" show-icon class="m-b-10"
					title="当前环境集群未安装 KEDA，无法启用自动扩缩容（手动扩缩不受影响）"
					description="请联系管理员安装：kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.19.0/keda-2.19.0.yaml" />
				<div class="detail-card">
					<div class="detail-card__title">模式与范围</div>
					<el-form label-width="90px" class="autoscale-form">
						<el-form-item label="扩缩模式">
							<el-radio-group v-model="asForm.enabled" :disabled="!kedaAvailable">
								<el-radio-button :label="false">手动</el-radio-button><!-- element-plus 2.3.4 取值属性是 label（value 为 2.6+） -->
								<el-radio-button :label="true">自动（KEDA）</el-radio-button>
							</el-radio-group>
							<div v-if="!asForm.enabled" class="form-tip">
								当前副本 <b>{{ detail.replicas ?? '—' }}</b> 由平台手动托管，可在服务列表"扩缩"中调整；切到"自动（KEDA）"后由下方定时规则接管
							</div>
							<div v-else class="form-tip">切换为自动后，列表"扩缩"按钮停用，副本由 KEDA 按下方配置托管</div>
						</el-form-item>
						<template v-if="asForm.enabled">
							<el-form-item label="副本范围">
								<div class="as-range">
									<el-input-number v-model="asForm.min_replicas" :min="0" :max="Math.max(asForm.max_replicas - 1, 0)" />
									<span class="as-range__sep">~</span>
									<el-input-number v-model="asForm.max_replicas" :min="1" :max="200" />
								</div>
								<div class="form-tip">下限为空闲时段副本数，0 = 缩到零（GPU 冷启动需分钟级）</div>
							</el-form-item>
							<el-form-item label="冷却时间">
								<div class="as-range">
									<el-input-number v-model="asForm.cooldown_period_seconds" :min="0" :max="3600" :step="60" />
									<span class="as-unit">秒</span>
								</div>
								<div class="form-tip">缩容前等待时长，0 = 用 KEDA 默认 300 秒</div>
							</el-form-item>
						</template>
					</el-form>
				</div>
				<div v-if="asForm.enabled" class="detail-card">
					<div class="flex-between m-b-10">
						<div class="detail-card__title" style="margin-bottom:0">定时规则</div>
						<el-button size="small" :icon="Plus" :disabled="!kedaAvailable" @click="addRule">新增规则</el-button>
					</div>
					<div class="form-tip m-b-10">cron 窗口内收敛到"期望副本"，窗口外回落到副本下限；多条规则重叠时后触发者生效，时区默认 Asia/Shanghai</div>
					<el-table :data="asForm.rules" border size="small">
						<el-table-column label="规则名" min-width="140">
							<template #default="{ row }"><el-input v-model="row.name" placeholder="如 work-hours" size="small" /></template>
						</el-table-column>
						<el-table-column label="开始（cron）" min-width="150">
							<template #default="{ row }">
								<el-input v-model="row.start" placeholder="0 8 * * 1-5" size="small" />
								<div class="cron-hint">{{ cronHint(row.start) }}</div>
							</template>
						</el-table-column>
						<el-table-column label="结束（cron）" min-width="150">
							<template #default="{ row }">
								<el-input v-model="row.end" placeholder="0 20 * * 1-5" size="small" />
								<div class="cron-hint">{{ cronHint(row.end) }}</div>
							</template>
						</el-table-column>
						<el-table-column label="期望副本" width="130">
							<template #default="{ row }"><el-input-number v-model="row.desired_replicas" :min="1" :max="asForm.max_replicas" size="small" controls-position="right" style="width:100%" /></template>
						</el-table-column>
						<el-table-column label="时区" width="150">
							<template #default="{ row }"><el-input v-model="row.timezone" placeholder="Asia/Shanghai" size="small" /></template>
						</el-table-column>
						<el-table-column label="" width="70" align="center">
							<template #default="{ $index }"><el-button link type="danger" size="small" @click="asForm.rules.splice($index, 1)">删除</el-button></template>
						</el-table-column>
						<template #empty>
							<div class="as-empty">
								<div class="as-empty__text">还没有定时规则</div>
								<div class="as-empty__sub">新增一条，让服务在工作时段自动扩容、夜间自动回收</div>
								<el-button size="small" type="primary" plain :icon="Plus" @click="addRule">新增规则</el-button>
							</div>
						</template>
					</el-table>
				</div>
				<div class="as-footer">
					<span class="as-footer__state" :class="asDirty ? 'is-dirty' : 'is-saved'">
						<i class="as-footer__dot" />{{ asDirty ? '有未保存的修改，保存后立即下发集群' : '与已保存配置一致' }}
					</span>
					<el-button type="primary" :loading="asSaving" :disabled="!asDirty" @click="saveAutoscale">保存弹性策略</el-button>
				</div>
			</el-tab-pane>

			<!-- Pod 列表（数据源：集群实例镜像表 /cluster/pods，按归属服务过滤） -->
			<el-tab-pane label="Pod 列表" name="pods">
				<div class="flex-between m-b-10">
					<span class="log-tip">实例列表来自集群实时状态（按归属服务 {{ name }} 过滤）</span>
					<el-button :icon="Refresh" size="small" @click="loadPods">刷新</el-button>
				</div>
				<el-table :data="pods" border stripe v-loading="podsLoading">
					<el-table-column prop="name" label="Pod 名" min-width="220" show-overflow-tooltip />
					<el-table-column label="状态" width="110" align="center">
						<template #default="{ row }">
							<PhaseTag :phase="row.phase" />
						</template>
					</el-table-column>
					<el-table-column prop="restarts" label="重启" width="80" align="center" />
					<el-table-column prop="pod_ip" label="IP" width="140" />
					<el-table-column prop="node_name" label="节点" min-width="150" show-overflow-tooltip />
					<el-table-column label="Age" width="90">
						<template #default="{ row }">{{ age(row.create_time) }}</template>
					</el-table-column>
					<el-table-column label="操作" width="210" align="center">
						<template #default="{ row }">
							<el-button link type="primary" size="small" @click="openLogs(row)">日志</el-button>
							<el-button link type="primary" size="small" :disabled="row.phase !== 'Running'" @click="openTerminal(row)">终端</el-button>
							<el-button link type="primary" size="small" @click="openEvents(row)">事件</el-button>
							<el-button link type="primary" size="small" @click="openRestart(row)">重启</el-button>
						</template>
					</el-table-column>
					<template #empty>
						<el-empty :description="detail.status === 'NotDeployed' ? '服务尚未下发到集群' : '暂无运行实例'" :image-size="60">
							<el-button type="primary" size="small" :loading="applying" :disabled="!detail.spec && !detail.resolved_spec" @click="onApply">去下发</el-button>
						</el-empty>
					</template>
				</el-table>
			</el-tab-pane>

			<!-- 日志（SSE 流式跟随，pod 级：/cluster/pods/:name/logs） -->
			<el-tab-pane label="日志" name="logs">
				<div class="flex-between m-b-10">
					<div class="flex align-center">
						<el-select v-model="selectedPod" size="small" placeholder="选择实例" style="width: 340px; margin-right: 8px" filterable :disabled="!sortedPods.length">
							<el-option v-for="p in sortedPods" :key="p.name" :label="`${p.name}（${p.phase}）`" :value="p.name" />
						</el-select>
						<el-button v-if="!streaming" type="primary" size="small" :disabled="!selectedPod" @click="startLogs">开始跟随</el-button>
						<el-button v-else size="small" @click="stopLogs">停止</el-button>
						<el-button size="small" :disabled="!logs.length" @click="logs = []">清屏</el-button>
					</div>
					<span class="log-tip">{{ logTip }}</span>
				</div>
				<div ref="logBoxRef" class="log-box">
					<pre v-for="(line, i) in logs" :key="i">{{ line }}</pre>
					<el-empty v-if="!logs.length && !streaming" :description="pods.length ? '暂无日志' : '无运行实例，请先下发到集群'" />
				</div>
			</el-tab-pane>
		</el-tabs>

		<!-- K8s 清单抽屉：直读 resolved_spec 快照（后端渲染产物，不做前端二次渲染，所见即所apply 的基准） -->
		<el-drawer v-model="yamlOpen" title="K8s 清单（由平台按当前配置生成）" size="55%">
			<div class="yaml-tip">
				<el-alert type="info" :closable="false" show-icon
					title="只读快照：请勿直接 kubectl 修改集群内对象。权威源是服务的声明配置，集群 diff 能力将在下发阶段提供。" />
			</div>
			<div class="yaml-meta" v-if="detail.renderer_version">
				<el-tag size="small" type="info">渲染器 {{ detail.renderer_version }}</el-tag>
			</div>
			<pre class="yaml-box">{{ detail.resolved_spec || '该服务创建时未生成渲染快照（M1 旧记录）' }}</pre>
		</el-drawer>

		<!-- 实例终端（WebSocket+录像，录像开关由后端 terminal 配置控制）与事件抽屉 -->
		<PodTerminalDrawer v-model="terminalOpen" :pod="activePod" />
		<PodEventsDrawer v-model="eventsOpen" :pod="activePod" />
	</div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch, defineComponent, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '/@/api/inference';
import { getClusterPods, restartPod, type ClusterPodItem } from '/@/api/cluster';
import { streamRequest } from '/@/utils/sse';
import PhaseTag from '/@/components/PhaseTag.vue';
import PodTerminalDrawer from '/@/components/PodTerminalDrawer.vue';
import PodEventsDrawer from '/@/components/PodEventsDrawer.vue';
import { useEnvStore } from '/@/stores/env';
import { useEngineRegistryStore } from '/@/stores/engineRegistry';
import { useServiceTreeStore } from '/@/stores/serviceTree';

const route = useRoute();
const router = useRouter();
const envStore = useEnvStore();
const engineStore = useEngineRegistryStore();
const treeStore = useServiceTreeStore();
const name = ref(String(route.params.name || ''));

// 空值统一展示：空 → 灰字"未配置"（悬停给出补全提示），非空原样输出。
// 老记录（契约 v1.1 前）大量字段为空，"—"无法区分"未配置"与"加载失败"，统一灰字+提示更可读。
const DVal = defineComponent({
	props: { v: { type: [String, Number] as any, default: '' } },
	setup(props: any) {
		return () => {
			const v = props.v;
			const empty = v === undefined || v === null || v === '';
			if (empty) return h('span', { class: 'na-val', title: '未配置（可在编辑抽屉中补全）' }, '未配置');
			return h('span', String(v));
		};
	},
});

const loading = ref(false);
const detail = ref<any>({});
const activeTab = ref('overview');
// K8s 清单抽屉开关（此前未声明，模板赋值静默失败 → 按钮点击无响应）
const yamlOpen = ref(false);

// 契约字段容错读取：M1 落库后优先取 spec（inference_spec JSON），旧记录回退到顶层字段
const spec = computed<any>(() => detail.value?.spec ?? detail.value ?? {});

// 所属服务节点：把 service_tree_id 翻译成节点全路径（树里找不到时回退显示 id，
// 兼容跨环境直开详情/树未加载的场景）
const treeNodeText = computed(() => {
	const id = Number(detail.value?.service_tree_id || 0);
	if (!id) return '—';
	const node = treeStore.nodeById(id);
	return node ? node.path || node.name : `节点 #${id}`;
});

// 环境名：环境 ID 对用户无意义，翻译成名称（找不到时回退 id）
const envName = computed(() => {
	const id = Number(detail.value?.env_id || 0);
	return envStore.envList.find((e) => e.id === id)?.name || (id ? `环境 #${id}` : '');
});

// 节点池名：优先快照里的名称，旧记录/快照缺失回退 #id
const poolName = computed(() => {
	try {
		const snap = detail.value?.node_pool_snapshot ? JSON.parse(detail.value.node_pool_snapshot) : null;
		if (snap?.name) return String(snap.name);
	} catch {
		/* 快照损坏时回退 #id */
	}
	return spec.value.node_pool_id ? `#${spec.value.node_pool_id}` : '';
});

// 对外模型名（空安全）
const servedName = computed(() => spec.value.served_model_name || detail.value.model || '');

// 副本打散（空安全：未定义 = 旧记录未配置）
const spreadText = computed(() => {
	const v = spec.value.scheduling?.spread;
	return v === undefined || v === null ? '' : v
		? '开启'
		: '关闭';
});

// 引擎坐标：注册表为准；未命中（行被删/跨环境）回退到 spec 快照里的镜像地址 ——
// 旧实现是内置 mock 表查找，未命中直接显示空白，排障时反而看不到用了什么镜像。
const engineDisplay = computed(() => {
	const fromRegistry = engineStore.displayById(spec.value.engine_id);
	return fromRegistry || String(spec.value.image || '');
});
const engineParams = computed(() => Object.entries(spec.value.engine_params || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));

const formatParamValue = (v: unknown) => (typeof v === 'boolean' ? (v ? '开' : '关') : v === '' ? '空' : String(v));
// share_mode 展示：一期实际支持 none / hami；time-slicing / MIG 未开放（保留映射，存量/未来数据可读）
const shareModeText = computed(
	() =>
		({
			none: '整卡（不共享）',
			hami: 'HAMi 显存/算力切分',
			'time-slicing': '算力切分',
			mig: 'MIG 隔离',
		} as Record<string, string>)[spec.value.share_mode] || ''
);
// HAMi 切片显存：渲染时按此换算 volcano.sh/vgpu-memory（MiB），详情页回显便于核对配额
const cardMemoryText = computed(() => (spec.value.card_memory_mib ? `${spec.value.card_memory_mib / 1024} GiB` : ''));
// 弹性范围：自动模式取 spec.autoscale（权威源），手动模式无弹性范围概念
const elasticRange = computed(() => {
	const a = spec.value?.autoscale;
	if (a?.enabled) return `${a.min_replicas} ~ ${a.max_replicas}`;
	return '手动固定';
});

const probePortNum = computed(() => (spec.value.probes?.port !== undefined && spec.value.probes?.port !== null ? String(spec.value.probes.port) : ''));
const startupTimeoutText = computed(() => (probePortNum.value ? `${spec.value.probes?.startup_timeout_minutes ?? '—'} 分钟` : ''));
const graceText = computed(() => (spec.value.lifecycle?.termination_grace_seconds ? `${spec.value.lifecycle.termination_grace_seconds}s` : ''));

// 探针展示：新结构（enabled/type/path）优先，旧记录回退到 readiness_path/liveness_path
const probeText = (key: 'readiness' | 'liveness') => {
	const p = spec.value.probes?.[key];
	if (p && typeof p === 'object') {
		if (!p.enabled) return '已关闭';
		return p.type === 'tcp' ? `TCP 探活 :${spec.value.probes?.port ?? ''}` : `HTTP ${p.path || '/health'}`;
	}
	const legacy = key === 'readiness' ? spec.value.readiness_path : spec.value.liveness_path;
	return legacy ? `HTTP ${legacy}` : '';
};

const postStartCommand = computed(() => spec.value.lifecycle?.post_start?.command || '');

// ---- 实例与日志：数据源为集群模块（/cluster/pods 镜像表 + pod 级 SSE 日志）----
// ── 弹性策略（KEDA 自动/定时扩缩容）──────────────────────────────────────
interface AsRule { name: string; start: string; end: string; timezone: string; desired_replicas: number; }
const asForm = reactive({ enabled: false, min_replicas: 1, max_replicas: 4, cooldown_period_seconds: 0, rules: [] as AsRule[] });
const asSaved = ref('');
const kedaAvailable = ref(true);
const asSaving = ref(false);

// cron 常用模板提示（常用表达式旁显示人话时间）
const cronHint = (expr: string) => {
	const presets: Record<string, string> = {
		'0 8 * * 1-5': '工作日 08:00',
		'0 20 * * 1-5': '工作日 20:00',
		'0 9 * * *': '每天 09:00',
		'0 22 * * *': '每天 22:00',
	};
	return presets[expr.trim()] || '';
};

const snapshotAs = (f: typeof asForm) =>
	JSON.stringify({ enabled: f.enabled, min_replicas: f.min_replicas, max_replicas: f.max_replicas, cooldown_period_seconds: f.cooldown_period_seconds, rules: f.rules });
const asDirty = computed(() => snapshotAs(asForm) !== asSaved.value);

const addRule = () => {
	asForm.rules.push({ name: '', start: '0 8 * * 1-5', end: '0 20 * * 1-5', timezone: 'Asia/Shanghai', desired_replicas: Math.max(1, asForm.max_replicas) });
};

// 详情载入后：回填弹性表单（spec.autoscale → 表单，旧记录无该段时给默认值）
const syncAutoscaleForm = () => {
	const a = spec.value?.autoscale || {};
	asForm.enabled = !!a.enabled;
	asForm.min_replicas = a.min_replicas ?? 1;
	asForm.max_replicas = a.max_replicas ?? 4;
	asForm.cooldown_period_seconds = a.cooldown_period_seconds ?? 0;
	asForm.rules = (a.rules || []).map((r: any) => ({
		name: r.name || '', start: r.start || '', end: r.end || '',
		timezone: r.timezone || 'Asia/Shanghai', desired_replicas: r.desired_replicas || 1,
	}));
	asSaved.value = snapshotAs(asForm);
};

const checkKeda = async () => {
	try {
		const res: any = await api.getAutoscaleAvailable();
		kedaAvailable.value = !!res.available;
	} catch {
		kedaAvailable.value = false;
	}
};

const saveAutoscale = async () => {
	// 本地静态校验（与后端 Validate 同规则，先拦一层减少往返）
	if (asForm.enabled) {
		if (asForm.max_replicas < 1 || asForm.min_replicas < 0 || asForm.min_replicas >= asForm.max_replicas) {
			ElMessage.error('副本范围需满足 0 ≤ 下限 < 上限');
			return;
		}
		if (!asForm.rules.length) {
			ElMessage.error('至少配置一条定时规则');
			return;
		}
		for (const [i, r] of asForm.rules.entries()) {
			if (r.start.trim().split(/\s+/).length !== 5 || r.end.trim().split(/\s+/).length !== 5) {
				ElMessage.error(`规则 ${i + 1} 的 cron 须为 5 段（分 时 日 月 周）`);
				return;
			}
			if (r.desired_replicas < 1 || r.desired_replicas > asForm.max_replicas) {
				ElMessage.error(`规则 ${i + 1} 的期望副本须在 [1, ${asForm.max_replicas}]`);
				return;
			}
		}
	}
	const action = asForm.enabled ? '启用自动扩缩（下发 ScaledObject，副本交给 KEDA 托管）' : '切回手动（删除 ScaledObject，平台重夺副本所有权）';
	try {
		await ElMessageBox.confirm(`${action}，保存后立即按新配置下发集群。确认？`, '保存弹性策略', {
			confirmButtonText: '保存并下发', cancelButtonText: '取消', type: 'warning',
		});
	} catch {
		return;
	}
	asSaving.value = true;
	try {
		const nextSpec = { ...spec.value, autoscale: asForm.enabled ? { ...asForm } : { enabled: false } };
		await api.updateInference(name.value, { spec: nextSpec, apply: true });
		ElMessage.success('弹性策略已保存并下发');
		await loadDetail();
		syncAutoscaleForm();
	} finally {
		asSaving.value = false;
	}
};

const podsLoading = ref(false);
const pods = ref<any[]>([]);
const selectedPod = ref('');
const streaming = ref(false);
const logs = ref<string[]>([]);
const logTip = ref('');
const logBoxRef = ref<HTMLElement | null>(null);
let logCtrl: AbortController | null = null;

// 行缓冲上限：长跑日志不无限吃内存
const MAX_LOG_LINES = 2000;

// 实例下拉按创建时间倒序：默认选中最新实例（ReplicaSet hash 随机，按名字排序选"最新"无意义）
const sortedPods = computed(() =>
	[...pods.value].sort((a, b) => new Date(b.create_time || 0).getTime() - new Date(a.create_time || 0).getTime())
);
const latestPodName = computed(() => sortedPods.value[0]?.name || '');

const age = (t?: string) => {
	if (!t) return '—';
	const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
};

const statusTagType = (s: string) =>
	({ Creating: 'info', Running: 'success', Updating: 'warning', Scaling: 'warning', Error: 'danger', Stopped: 'info' } as Record<string, string>)[s] || 'info';

// 下发：确认 → spec 重渲染 → server-side apply → 刷新详情
const applying = ref(false);
const onApply = async () => {
	try {
		await ElMessageBox.confirm(
			'将按平台声明（spec 重渲染）server-side apply 到该环境集群，集群内手工改动会被收敛。确认下发？',
			'下发到集群',
			{ confirmButtonText: '下发', cancelButtonText: '取消', type: 'warning' }
		);
	} catch {
		return;
	}
	applying.value = true;
	try {
		const res: any = await api.applyInference(name.value);
		ElMessage.success(`下发成功：Deployment ${res.deployment}（ClusterIP ${res.cluster_ip}:${res.service_port}）`);
		await loadDetail();
	} finally {
		applying.value = false;
	}
};

const loadDetail = async () => {
	loading.value = true;
	try {
		detail.value = await api.getInferenceDetail(name.value);
		syncAutoscaleForm();
		loadArgv(); // 启动命令随服务一起刷新（best-effort，失败只影响该卡片）
	} finally {
		loading.value = false;
	}
};

// ---- 启动命令（只读）----
// 后端复用 apply 的渲染路径返回 command + args，所以这里看到的就是真正会下发的命令；
// 用户在服务器上手工 docker run 对照测试时，直接复制 shell_line 即可。
const argvInfo = ref<api.InferenceArgv | null>(null);
const argvError = ref('');
const loadArgv = async () => {
	try {
		// 断言原因同 list.vue：request 层运行时已解包 data，类型签名仍标 AxiosResponse
		argvInfo.value = (await api.getInferenceArgv(name.value)) as unknown as api.InferenceArgv;
		argvError.value = '';
	} catch (e) {
		// 渲染失败（模型/版本被删等）：把后端给的原因直接展示，这本身就是诊断信息
		argvInfo.value = null;
		argvError.value = `启动命令暂不可用：${(e as Error)?.message || '渲染失败'}`;
	}
};
const copyArgv = async () => {
	const line = argvInfo.value?.shell_line || '';
	if (!line) return;
	try {
		await navigator.clipboard.writeText(line);
		ElMessage.success('已复制启动命令');
	} catch {
		ElMessage.warning('复制失败，请手动选中命令文本');
	}
};
const loadPods = async () => {
	podsLoading.value = true;
	try {
		const res: any = await getClusterPods({
			service_ref: name.value,
			namespace: detail.value.namespace || undefined,
			size: 100,
		});
		pods.value = res?.list ?? [];
	} finally {
		podsLoading.value = false;
	}
};

// ---- 日志 SSE 流 ----

const stopLogs = () => {
	if (logCtrl) {
		logCtrl.abort();
		logCtrl = null;
	}
	streaming.value = false;
};

const startLogs = () => {
	const pod = pods.value.find((p) => p.name === selectedPod.value);
	if (!pod || streaming.value) return;
	logs.value = [];
	logTip.value = `正在跟随 ${pod.name} 的日志…`;
	logCtrl = new AbortController();
	const ctrl = logCtrl;
	streaming.value = true;
	streamRequest(
		`/cluster/pods/${encodeURIComponent(pod.name)}/logs`,
		{ namespace: pod.namespace, tail: 200, follow: 1 },
		{
			onMessage: (line) => {
				// ctrl 已过期（停止/切换实例后旧流的残余帧）直接丢弃
				if (logCtrl !== ctrl) return;
				const el = logBoxRef.value;
				// 用户停留在底部附近才自动跟随滚动，向上翻阅历史时不打扰
				const stick = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
				logs.value.push(line);
				if (logs.value.length > MAX_LOG_LINES) logs.value.splice(0, logs.value.length - MAX_LOG_LINES);
				if (stick && el) nextTick(() => (el.scrollTop = el.scrollHeight));
			},
			onEnd: () => {
				if (logCtrl !== ctrl) return;
				streaming.value = false;
				logCtrl = null;
				logTip.value = '日志流已结束（实例可能已重建或终止，可刷新实例列表后重试）';
			},
			onError: (message) => {
				if (logCtrl !== ctrl) return;
				streaming.value = false;
				logCtrl = null;
				logTip.value = `日志拉取失败：${message}`;
				ElMessage.error(message);
			},
		},
		ctrl.signal
	);
};

// 实例列表点「日志」：选中该实例并切到日志页签（开流由 activeTab watch 统一负责）
const openLogs = (row: any) => {
	selectedPod.value = row.name;
	activeTab.value = 'logs';
};

// 实例列表点「终端/事件」：共用当前选中实例；终端打开后由抽屉内部自管 WS 生命周期
const terminalOpen = ref(false);
const eventsOpen = ref(false);
const activePod = ref<ClusterPodItem | null>(null);

const openTerminal = (row: ClusterPodItem) => {
	activePod.value = row;
	terminalOpen.value = true;
};
const openEvents = (row: ClusterPodItem) => {
	activePod.value = row;
	eventsOpen.value = true;
};

// 重启实例：删除 Pod 由控制器自动重建（二次确认防误触）
const openRestart = async (row: ClusterPodItem) => {
	try {
		await ElMessageBox.confirm(`确认重启实例 ${row.name}？将删除该实例并由控制器自动重建。`, '重启实例', {
			confirmButtonText: '重启',
			cancelButtonText: '取消',
			type: 'warning',
		});
	} catch {
		return;
	}
	await restartPod(row.name, { namespace: row.namespace });
	ElMessage.success('重启已触发，实例将由控制器自动重建');
	loadPods();
};

watch(activeTab, async (t) => {
	if (t === 'pods') {
		stopLogs();
		if (!pods.value.length) loadPods();
		return;
	}
	if (t === 'logs') {
		if (!pods.value.length) await loadPods();
		// 选中实例不存在（首次进入或已被重建淘汰）时回退到最新实例
		if (!pods.value.some((p) => p.name === selectedPod.value)) {
			selectedPod.value = latestPodName.value;
		}
		if (selectedPod.value && !streaming.value) startLogs();
		return;
	}
	// 其它页签：SSE 长连接不挂在后台页签上
	stopLogs();
});

// 环境自愈：直开分享链接（?envid=x）时，页面挂载后的首个请求可能带着
// localStorage 里的旧环境头而失败（40400），env store 异步解析到 URL 环境后
// 此处自动重载 —— 否则详情永远空挂，页头按钮因 !resolved_spec 全部禁用且无提示。
// pods/logs 同属该环境，一并作废等按需重拉。
watch(
	() => envStore.envId,
	(nv, ov) => {
		if (!nv || nv === ov) return;
		stopLogs();
		// 切环境：终端/事件抽屉立即收起，避免会话连到旧环境实例
		terminalOpen.value = false;
		eventsOpen.value = false;
		activePod.value = null;
		pods.value = [];
		logs.value = [];
		selectedPod.value = '';
		logTip.value = '';
		loadDetail();
	}
);

onMounted(() => {
	engineStore.ensureLoaded(); // 引擎坐标回显用（best-effort，失败时回退 spec.image）
	loadDetail();
	checkKeda();
});
onMounted(loadDetail);
onBeforeUnmount(stopLogs);
</script>

<style scoped lang="scss">
.page-title {
	font-size: 16px;
	font-weight: 600;
}
.detail-card {
	margin-bottom: 16px;
	&__title {
		margin-bottom: 10px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink, #303133);
	}
}
.param-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 10px;
}
// 启动命令：等宽可换行，长命令不撑破卡片；横向可滚避免被迫折行看不出结构
.argv-box {
	margin: 0;
	padding: 10px 12px;
	overflow-x: auto;
	font-family: 'Menlo', 'Consolas', monospace;
	font-size: 12px;
	line-height: 1.7;
	white-space: pre-wrap;
	word-break: break-all;
	background: rgba(0, 0, 0, 0.04);
	border-radius: 4px;
}
.argv-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	margin-top: 6px;
	font-size: 12px;
	color: var(--ink-low, #909399);
}
.m-l-8 {
	margin-left: 8px;
}
.m-t-8 {
	margin-top: 8px;
}
.param-tag {
	font-family: 'Menlo', 'Consolas', monospace;
	.param-tag__eq {
		margin: 0 2px;
		opacity: 0.6;
	}
}
.extra-args {
	margin-top: 8px;
	font-size: 12px;
	&__label {
		color: var(--ink-low, #909399);
	}
	&__item {
		display: inline-block;
		padding: 1px 6px;
		margin: 2px 4px 2px 0;
		font-family: 'Menlo', 'Consolas', monospace;
		background: rgba(0, 0, 0, 0.05);
		border-radius: 4px;
	}
}
.mono {
	font-family: 'Menlo', 'Consolas', monospace;
}
.detail-fallback {
	margin-top: 8px;
	font-size: 12px;
	color: var(--ink-low, #909399);
}
.poststart {
	margin-top: 10px;
	&__label {
		margin-bottom: 6px;
		font-size: 12px;
		color: var(--ink-low, #909399);
	}
	&__cmd {
		padding: 10px 12px;
		margin: 0;
		font-family: 'Menlo', 'Consolas', monospace;
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
		background: #1e1e1e;
		color: #d4d4d4;
		border-radius: 6px;
	}
}
.autoscale-form {
	max-width: 640px;
}
.form-tip {
	font-size: 12px;
	color: var(--ink-low, #909399);
	line-height: 1.5;
}
.as-range {
	display: flex;
	align-items: center;
	gap: 8px;
	&__sep {
		color: var(--ink-low, #909399);
	}
}
.as-unit {
	margin-left: 2px;
	font-size: 12px;
	color: var(--ink-low, #909399);
}
.as-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 2px 2px;
	border-top: 1px solid var(--el-border-color-lighter, #e4e7ed);
	&__state {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
	}
	&__dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	&__state.is-saved {
		color: var(--ink-low, #909399);
		.as-footer__dot {
			background: #c0c4cc;
		}
	}
	&__state.is-dirty {
		color: var(--el-color-warning, #e6a23c);
		.as-footer__dot {
			background: var(--el-color-warning, #e6a23c);
		}
	}
}
.as-empty {
	padding: 18px 0;
	&__text {
		margin-bottom: 4px;
		font-size: 13px;
		color: var(--ink, #303133);
	}
	&__sub {
		margin-bottom: 10px;
		font-size: 12px;
		color: var(--ink-low, #909399);
	}
}
.m-t-5 {
	margin-top: 5px;
}
.cron-hint {
	font-size: 11px;
	color: var(--ink-low, #909399);
	line-height: 1.3;
}
.na-val {
	color: var(--ink-low, #909399);
	font-size: 12px;
	cursor: default;
}
.log-tip {
	font-size: 12px;
	color: #909399;
}
.yaml-tip {
	margin-bottom: 10px;
}
.yaml-meta {
	margin-bottom: 8px;
}
.yaml-box {
	padding: 12px;
	margin: 0;
	font-family: 'Menlo', 'Consolas', monospace;
	font-size: 12px;
	line-height: 1.6;
	white-space: pre-wrap;
	word-break: break-word;
	background: #1e1e1e;
	color: #d4d4d4;
	border-radius: 4px;
	max-height: calc(100vh - 220px);
	overflow: auto;
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
