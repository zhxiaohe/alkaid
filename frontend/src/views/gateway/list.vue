<template>
	<div>
		<el-alert
			v-if="!treeStore.hasSelected"
			title="网关列表按环境展示（不再按节点过滤）。左侧选择服务节点仅用于确定新建网关的归属。"
			type="info"
			:closable="false"
			show-icon
			class="m-b-15"
		/>

		<!-- 下发能力探测：集群没装 Gateway API CRD 时，"下发"按钮点下去必然失败，
		     与其让用户点完看报错，不如提前说清缺什么（best-effort，探测失败不阻塞列表）。
		     两种状态都回显目标集群地址：多环境平台里"平台连的是哪个集群"是这类失败的头号嫌疑，
		     只看一句"CRD 未注册"无法判断是不是连错了集群。 -->
		<el-alert
			v-if="apiAvail && !apiAvail.available"
			:title="`当前环境无法下发网关路由：${apiAvail.reason}`"
			:description="apiAvail.cluster_host ? `平台连接的目标集群：${apiAvail.cluster_host}` : ''"
			type="warning"
			:closable="false"
			show-icon
			class="m-b-15"
		/>
		<el-alert
			v-else-if="apiAvail?.available"
			:title="`网关下发已就绪：入口对象 ${apiAvail.gateway}（命名空间 ${apiAvail.gateway_namespace}），对外路径前缀 ${apiAvail.path_prefix_base}/<服务名>`"
			:description="apiAvail.cluster_host ? `平台连接的目标集群：${apiAvail.cluster_host}` : ''"
			type="success"
			:closable="false"
			show-icon
			class="m-b-15"
		/>

		<div class="flex-between m-b-15">
			<el-radio-group v-model="gwType" @change="onTypeChange">
				<el-radio-button label="">全部</el-radio-button>
				<el-radio-button label="ai">AI 网关</el-radio-button>
				<el-radio-button label="traffic">流量网关</el-radio-button>
			</el-radio-group>
			<div>
				<el-input v-model="keyword" placeholder="搜索网关名/域名" style="width: 220px; margin-right: 10px" clearable @keyup.enter="loadList" />
				<el-button type="primary" :icon="Plus" :disabled="!treeStore.hasSelected" @click="openCreate">新建网关</el-button>
			</div>
		</div>

		<el-table :data="paginator.list" border stripe v-loading="loading">
			<el-table-column prop="name" label="网关名称" min-width="150" />
			<el-table-column label="类型" width="110" align="center">
				<template #default="{ row }">
					<el-tag :type="row.type === 'ai' ? 'success' : 'warning'" size="small">
						{{ row.type === 'ai' ? 'AI 网关' : '流量网关' }}
					</el-tag>
				</template>
			</el-table-column>
			<!-- 接入驱动（M4）：空 = 一期旧记录，不自动迁移（设计 §12.3-9） -->
			<el-table-column label="接入驱动" width="130">
				<template #default="{ row }">
					<el-tag v-if="row.provider" size="small" :type="row.provider === 'higress' ? 'success' : 'warning'">
						{{ providerText(row.provider) }}
					</el-tag>
					<span v-else class="na-val" title="一期建的记录没有驱动信息，不自动迁移；下发前需补选驱动并补全配置">未指定驱动</span>
				</template>
			</el-table-column>
			<el-table-column prop="domain" label="域名" min-width="180" show-overflow-tooltip>
				<template #default="{ row }">
					<span v-if="row.domain">{{ row.domain }}</span>
					<span v-else class="na-val" title="未配置对外域名">未配置</span>
				</template>
			</el-table-column>
			<!-- AI 网关专属列 -->
			<el-table-column v-if="gwType !== 'traffic'" label="模型路由" min-width="200">
				<template #default="{ row }">
					<template v-if="modelNamesOf(row).length">
						<el-tag v-for="(m, i) in modelNamesOf(row)" :key="i" size="small" class="m-r-5 m-b-5">{{ m }}</el-tag>
					</template>
					<span v-else class="na-val" title="spec 里还没有模型路由">未配置</span>
				</template>
			</el-table-column>
			<!-- 流量网关专属列 -->
			<el-table-column v-if="gwType !== 'ai'" label="路由规则" min-width="220">
				<template #default="{ row }">
					<template v-if="row.type === 'traffic' && row.paths?.length">
						<el-tag v-for="(p, i) in row.paths" :key="i" size="small" class="m-r-5 m-b-5">
							{{ p.path }} → {{ p.backend }}
						</el-tag>
					</template>
					<span v-else class="na-val">不适用</span>
				</template>
			</el-table-column>
			<el-table-column label="状态" width="120" align="center">
				<template #default="{ row }">
					<el-tag :type="statusTagType(row.status)" :title="statusTitle(row.status)">{{ row.status || 'NotDeployed' }}</el-tag>
				</template>
			</el-table-column>
			<!-- 入口地址：下发后从集群 Gateway 的 status.addresses 回读，是"能不能连起来"的唯一凭据 -->
			<el-table-column label="入口地址" width="170" show-overflow-tooltip>
				<template #default="{ row }">
					<span v-if="row.endpoint" class="mono">{{ row.endpoint }}</span>
					<span v-else class="na-val" title="尚未下发到集群">未下发</span>
				</template>
			</el-table-column>
			<el-table-column label="最近下发" width="170">
				<template #default="{ row }">
					<span v-if="row.dispatched_at">{{ row.dispatched_at }}</span>
					<span v-else class="na-val" title="平台尚未把配置下发到集群">未下发</span>
				</template>
			</el-table-column>
			<!-- 失败原因直接进列：下发失败时最需要看到的就是"为什么"，
			     藏进详情里会让人以为只是状态标签变红了 -->
			<el-table-column label="错误摘要" min-width="180" show-overflow-tooltip>
				<template #default="{ row }">
					<span v-if="row.last_error" class="err-val">{{ row.last_error }}</span>
					<span v-else class="na-val">-</span>
				</template>
			</el-table-column>
			<el-table-column prop="created_at" label="创建时间" width="170" />
			<el-table-column label="操作" width="340" fixed="right">
				<template #default="{ row }">
					<el-button link type="primary" @click="openDetail(row)">详情</el-button>
					<el-button v-if="row.type === 'ai'" link type="primary" @click="openEdit(row)">编辑</el-button>
					<!-- 下发 / 回收：只对有驱动声明的 AI 网关开放（traffic 型无驱动这一层概念） -->
					<template v-if="row.type === 'ai' && row.provider">
						<el-button link type="success" :loading="dispatching === row.name" @click="handleDispatch(row)">下发</el-button>
						<!-- 强制下发：集群侧一旦有人用 kubectl edit 改过平台托管的 Gateway，该字段就归
						     那个 manager 所有，普通 SSA 会报 conflict 并**永久**失败。平台刻意不做静默
						     覆盖（否则人工改动会无声消失），但必须给出这个显式出口。 -->
						<el-button
							link
							type="danger"
							:loading="dispatching === row.name"
							title="仅在普通下发报 conflict（字段被 kubectl edit 等占用）时使用：会覆盖集群侧手工改动，把字段所有权夺回平台"
							@click="handleDispatch(row, true)"
						>
							强制下发
						</el-button>
						<el-button v-if="row.resolved_spec || row.dispatched_at" link type="warning" @click="handleTeardown(row)">回收</el-button>
					</template>
					<el-button link type="danger" @click="handleDelete(row)">删除</el-button>
				</template>
			</el-table-column>
		</el-table>

		<el-pagination
			class="m-t-15"
			background
			layout="total, sizes, prev, pager, next, jumper"
			:page-size="paginator.size"
			:current-page="paginator.page"
			:total="paginator.total"
			:page-sizes="[10, 20, 50]"
			@size-change="(sz) => { paginator.size = sz; paginator.page = 1; loadList() }"
			@current-change="(p) => { paginator.page = p; loadList() }"
		/>

		<!-- 新建 / 编辑网关（编辑复用同一表单：名称与驱动锁定，spec 整体替换提交） -->
		<el-dialog v-model="createVisible" :title="dialogMode === 'create' ? '新建网关' : `编辑网关：${editingName}`" width="760px" :close-on-click-modal="false">
			<el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
				<el-form-item label="网关类型" prop="type">
					<el-radio-group v-model="form.type" :disabled="dialogMode === 'edit'">
						<!-- element-plus 2.3.4 取值属性是 label（value 为 2.6+，用错会静默失效） -->
						<el-radio label="ai">AI 网关（模型路由，需接入驱动）</el-radio>
						<el-radio label="traffic">流量网关（HTTPRoute / Ingress 通用七层路由）</el-radio>
					</el-radio-group>
				</el-form-item>
				<el-form-item label="网关名称" prop="name">
					<el-input v-model="form.name" placeholder="如 ai-gateway-chat" :disabled="dialogMode === 'edit'" />
				</el-form-item>

				<template v-if="form.type === 'ai'">
					<el-form-item label="接入驱动" prop="provider">
						<!-- 编辑态：已有驱动的记录不可变更（provider 决定 spec 专属段形状）；
						     一期旧记录（provider 为空）允许**首次补全**——否则存量记录只能删了重建，
						     而下发链路的提示语正是"请编辑补选驱动"，两处口径必须一致 -->
						<el-tag v-if="dialogMode === 'edit' && form.provider" type="info" size="large">{{ providerText(form.provider) }}（不可变更）</el-tag>
						<div v-else class="drv-list">
							<div
								v-for="p in providers"
								:key="p.name"
								class="drv-card"
								:class="{ 'is-disabled': !selectable(p), 'is-active': form.provider === p.name }"
								@click="pickProvider(p)"
							>
								<div class="drv-card__head">
									<span class="drv-card__name">{{ providerText(p.name) }}</span>
									<el-tag v-if="p.available && p.version" size="small" type="success">{{ p.version }}</el-tag>
									<el-tag v-else-if="p.available" size="small" type="success">已安装</el-tag>
									<el-tag v-else size="small" type="info">不可用</el-tag>
								</div>
								<div class="drv-card__desc">{{ providerDesc(p.name) }}</div>
								<div v-if="!p.available" class="drv-card__hint">
									{{ p.reason }}
									<el-button link type="primary" size="small" @click.stop="showHint(p)">安装 / 配置指引</el-button>
								</div>
							</div>
						</div>
						<div v-if="dialogMode === 'create' && providersMeta.ai_gateway_count > 0" class="form-tip">
							该环境已有 {{ providersMeta.ai_gateway_count }} 条 AI 网关记录：每服务可建自己的网关（集群里 Higress 实例仍是物理单例，下发时按环境聚合渲染，见 §9-9 修订）。
						</div>
						<div v-if="dialogMode === 'edit' && !form.provider" class="form-tip">
							这条记录是一期建的，还没有接入驱动。请补选驱动并补全下方配置：这是"首次补全"（允许），
							不是换驱动（已有驱动的记录不可变更）。
						</div>
					</el-form-item>
					<el-form-item label="命名空间">
						<el-input v-model="form.namespace" placeholder="留空则用环境默认命名空间" />
					</el-form-item>

					<!--
						provider 判断只允许出现在这一处（设计 §8 纪律）：
						其余文件里散落的 if provider === ... 一律禁止，否则加第三个驱动时会到处漏改
					-->
					<GatewayHigressForm
						v-if="form.provider === 'higress'"
						:spec="form.higress"
						:services="inferenceServices"
						:capabilities="capsOf('higress')"
					/>
					<GatewayLiteLLMForm
						v-else-if="form.provider === 'litellm'"
						:spec="form.litellm"
						:services="inferenceServices"
						:capabilities="capsOf('litellm')"
					/>
					<el-alert
						v-else
						type="info"
						:closable="false"
						show-icon
						title="请先选择一个可用的接入驱动，下方会出现该驱动的专属配置项"
					/>
				</template>

				<template v-else>
					<el-form-item label="域名" prop="domain">
						<el-input v-model="form.domain" placeholder="如 console.example.com" />
					</el-form-item>
					<el-form-item label="命名空间">
						<el-input v-model="form.namespace" placeholder="留空则用环境默认命名空间" />
					</el-form-item>
					<el-form-item label="路由路径">
						<el-input v-model="form.path" placeholder="如 /api/" />
					</el-form-item>
					<el-form-item label="后端服务">
						<el-input v-model="form.backend" placeholder="如 web-svc:8080" />
					</el-form-item>
				</template>
			</el-form>
			<template #footer>
				<el-button @click="createVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitDialog">
					{{ dialogMode === 'create' ? '创建' : '保存' }}
				</el-button>
			</template>
		</el-dialog>

		<!-- 下发详情抽屉：状态 / 入口 / 每个服务的接入地址 / 产物快照。
		     接入地址必须在这里给全（base_url + entry_url）：用户真正需要的是
		     "把 SDK 的 base_url 填什么"，而不是自己去拼 /svc/<服务名>/v1。 -->
		<el-drawer v-model="detailVisible" :title="`网关下发详情：${detailRow?.name || ''}`" size="780px" destroy-on-close>
			<template v-if="detailRow">
				<el-descriptions :column="2" border size="small" class="m-b-15">
					<el-descriptions-item label="状态">
						<el-tag :type="statusTagType(detailRow.status)">{{ detailRow.status || 'NotDeployed' }}</el-tag>
					</el-descriptions-item>
					<el-descriptions-item label="接入驱动">{{ providerText(detailRow.provider) }}</el-descriptions-item>
					<el-descriptions-item label="入口地址" :span="2">
						<span v-if="detailRow.endpoint" class="mono">{{ detailRow.endpoint }}</span>
						<span v-else class="na-val">未下发（集群里没有该环境的入口对象）</span>
					</el-descriptions-item>
					<el-descriptions-item label="集群对象" :span="2">
						<span class="mono">{{ gatewayObjectText }}</span>
					</el-descriptions-item>
					<!-- 端口必须显式展示：填错的症状恰恰是"入口地址为空"，此时 endpoint 一览无余，
					     用户需要一眼确认"我配的端口到底是多少" -->
					<el-descriptions-item label="数据面监听端口" :span="2">
						<span class="mono">{{ detailListenPort }}</span>
						<span class="form-tip">必须与集群里 higress-gateway Service 暴露的端口一致；留空或 0 表示用默认 80</span>
					</el-descriptions-item>
					<el-descriptions-item label="渲染器版本">{{ detailRow.renderer_version || '-' }}</el-descriptions-item>
					<el-descriptions-item label="最近下发">{{ detailRow.dispatched_at || '未下发' }}</el-descriptions-item>
					<el-descriptions-item label="本次聚合的记录" :span="2">
						{{ (detailState?.records?.length ? detailState.records : [detailRow.name]).join('、') }}
						<span class="form-tip">（集群入口是环境级单例，下发会收敛该环境该驱动下的全部记录）</span>
					</el-descriptions-item>
				</el-descriptions>

				<el-alert
					v-if="detailRow.last_error"
					title="最近一次失败原因"
					type="error"
					:closable="false"
					show-icon
					class="m-b-15"
					:description="detailRow.last_error"
				/>
				<el-alert
					v-if="detailState?.detail"
					title="集群侧未就绪说明"
					type="warning"
					:closable="false"
					show-icon
					class="m-b-15"
					:description="detailState.detail"
				/>

				<div class="sec-title">模型接入地址（把 OpenAI SDK 的 base_url 指向它）</div>
				<el-table :data="detailState?.services || []" size="small" border class="m-b-15">
					<el-table-column prop="name" label="推理服务" min-width="130" />
					<el-table-column prop="namespace" label="命名空间" width="110" />
					<el-table-column prop="port" label="端口" width="70" align="center" />
					<el-table-column label="base_url" min-width="240">
						<template #default="{ row }">
							<span class="mono">{{ row.entry_url || row.base_url }}</span>
							<el-button link type="primary" size="small" @click="copyText(row.entry_url || row.base_url)">复制</el-button>
						</template>
					</el-table-column>
				</el-table>
				<div v-if="!(detailState?.services || []).length" class="form-tip m-b-15">
					该环境下还没有被网关引用的已下发推理服务——先在「推理服务」里下发服务，再在编辑页把它加进模型路由。
				</div>

				<!-- 未参与本次收敛的记录：聚合语义最容易让人误解的地方，必须显式列出来 -->
				<template v-if="detailManifest?.skipped?.length">
					<div class="sec-title">未参与本次下发的记录</div>
					<div v-for="(s, i) in detailManifest.skipped" :key="i" class="skip-row">
						<b>{{ s.name }}</b>：<span class="form-tip">{{ s.reason }}</span>
					</div>
					<div class="m-b-15" />
				</template>

				<div class="sec-title">
					将下发的产物（只渲染，不下发）
					<el-button link type="primary" size="small" :loading="manifestLoading" @click="loadManifest">
						{{ detailManifest ? '刷新' : '生成预览' }}
					</el-button>
				</div>
				<pre v-if="detailManifest?.yaml" class="yaml-box">{{ detailManifest.yaml }}</pre>
				<div v-else-if="detailManifest" class="form-tip">
					产物为空：{{ detailManifest.service_count === 0 ? '该环境下暂无被网关引用的已下发服务' : '未生成' }}
				</div>
				<div class="form-tip m-t-15">
					说明：平台按「期望态收敛」工作——产物里没有、但带平台标签的下游对象会被回收；
					集群侧手工改动会在下次下发时被平台声明覆盖（权威源是网关配置，不是集群）。
				</div>
			</template>
			<template #footer>
				<el-button @click="detailVisible = false">关闭</el-button>
				<el-button v-if="detailRow?.type === 'ai' && detailRow?.provider" type="primary" :loading="dispatching === detailRow?.name" @click="handleDispatch(detailRow)">
					立即下发
				</el-button>
				<el-button
					v-if="detailRow?.type === 'ai' && detailRow?.provider"
					type="danger"
					plain
					:loading="dispatching === detailRow?.name"
					title="仅在普通下发报 conflict（字段被 kubectl edit 等占用）时使用：会覆盖集群侧手工改动，把字段所有权夺回平台"
					@click="handleDispatch(detailRow, true)"
				>
					强制下发
				</el-button>
			</template>
		</el-drawer>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import * as api from '/@/api/gateway';
import type {
	GatewayType,
	GatewayProvider,
	GatewaySpec,
	GatewayCreatePayload,
	HigressSpec,
	LiteLLMSpec,
	ProviderInfo,
} from '/@/api/gateway';
import { parseGatewaySpec } from '/@/api/gateway';
import { getInferenceList } from '/@/api/inference';
import { useServiceTreeStore } from '/@/stores/serviceTree';
import { useEnvStore } from '/@/stores/env';
import GatewayHigressForm from './components/GatewayHigressForm.vue';
import GatewayLiteLLMForm from './components/GatewayLiteLLMForm.vue';

const treeStore = useServiceTreeStore();
const envStore = useEnvStore();
const keyword = ref('');
const gwType = ref<'' | GatewayType>('');
const loading = ref(false);
const paginator = reactive({ total: 0, list: [] as any[], page: 1, size: 20 });

type TagType = 'success' | 'warning' | 'danger' | 'info';
const statusTagType = (s: string): TagType =>
	({ Running: 'success', Updating: 'warning', Error: 'danger', NotDeployed: 'info' } as Record<string, TagType>)[s] || 'info';
const statusTitle = (s: string) =>
	({ Running: '已下发且运行中', Updating: '下发中', Error: '下发失败，请看错误摘要', NotDeployed: '尚未下发到集群' } as Record<string, string>)[s] || '';

const providerText = (p?: string) => ({ higress: 'Higress', litellm: 'LiteLLM' } as Record<string, string>)[p || ''] || p || '未指定驱动';
const providerDesc = (p: string) =>
	({
		higress: 'L7 数据面网关：域名/TLS、按模型名路由、consumer 维度限流、AI 缓存与 MCP 托管',
		litellm: '应用层模型代理：模型聚合、virtual key 签发、key 级限额与 fallback 链',
	} as Record<string, string>)[p] || '';

// AI 网关的模型路由（优先取 spec.higress.model_routes，其次 litellm.model_list）
const modelNamesOf = (row: any): string[] => {
	// 列表行里的 spec 是 JSON 字符串（后端列类型 string），必须解析后使用
	const sp: GatewaySpec | null = parseGatewaySpec(row?.spec);
	if (!sp) return [];
	if (sp.higress?.model_routes?.length) return sp.higress.model_routes.map((r) => r.name).filter(Boolean);
	if (sp.litellm?.model_list?.length) return sp.litellm.model_list.map((m) => m.name).filter(Boolean);
	return [];
};

// ── 驱动探测：驱动选择开关与字段显隐的唯一来源（/gateway/providers/available）──────
const providers = ref<ProviderInfo[]>([]);
const providersMeta = reactive({ ai_gateway_count: 0, ai_slot_available: true });
const capsOf = (name: GatewayProvider) => providers.value.find((p) => p.name === name)?.capabilities || [];
const selectable = (p: ProviderInfo) => p.available && providersMeta.ai_slot_available;

const loadProviders = async () => {
	try {
		const r: any = await api.getProvidersAvailable();
		providers.value = r.providers || [];
		providersMeta.ai_gateway_count = r.ai_gateway_count ?? 0;
		providersMeta.ai_slot_available = r.ai_slot_available !== false;
	} catch {
		providers.value = [];
	}
};

// 可引用推理服务：环境内全部"已下发"的服务（不按节点过滤——任何服务的模型都应能挂上网关代理；
// 未下发的服务其 Service 在集群里不存在，引用会被后端直接拒绝）
const inferenceServices = ref<string[]>([]);
const loadServices = async () => {
	try {
		const r: any = await getInferenceList({ page: 1, size: 100 });
		const list: any[] = r.list || [];
		inferenceServices.value = list
			.filter((x) => !['Stopped', 'NotDeployed', ''].includes(x.status || ''))
			.map((x) => x.name);
	} catch {
		inferenceServices.value = [];
	}
};

const loadList = async () => {
	loading.value = true;
	try {
		const r = await api.getGatewayList({
			type: gwType.value || undefined,
			keyword: keyword.value,
			page: paginator.page,
			size: paginator.size,
		});
		Object.assign(paginator, r);
	} finally {
		loading.value = false;
	}
};

const onTypeChange = () => {
	paginator.page = 1;
	loadList();
};

// ── 新建 / 编辑 ─────────────────────────────────────────────────────────
const createVisible = ref(false);
const submitting = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingName = ref('');
const formRef = ref<FormInstance>();
const form = reactive({
	type: 'ai' as GatewayType,
	provider: '' as '' | GatewayProvider,
	name: '',
	namespace: '',
	// AI：两段 spec 各自独立（provider 判断只出现在模板的组件选择器）
	higress: { domain: '', tls_secret: '', model_routes: [], rate_limit: {} } as HigressSpec,
	litellm: { dispatch_mode: 'api', model_list: [], key_limits: {}, fallback_chain: [] } as LiteLLMSpec,
	// 流量网关
	domain: '',
	path: '/',
	backend: '',
});
const rules = {
	type: [{ required: true, message: '请选择网关类型', trigger: 'change' }],
	name: [{ required: true, message: '请输入网关名称', trigger: 'blur' }],
	domain: [{ required: true, message: '请输入域名', trigger: 'blur' }],
	provider: [
		{
			validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
				if (form.type === 'ai' && !v) cb(new Error('请选择一个可用的接入驱动'));
				else cb();
			},
			trigger: 'change',
		},
	],
};

const openCreate = () => {
	dialogMode.value = 'create';
	editingName.value = '';
	Object.assign(form, {
		type: 'ai',
		provider: '',
		name: '',
		namespace: '',
		higress: { domain: '', tls_secret: '', model_routes: [], rate_limit: {} },
		litellm: { dispatch_mode: 'api', model_list: [], key_limits: {}, fallback_chain: [] },
		domain: '',
		path: '/',
		backend: '',
	});
	createVisible.value = true;
	loadProviders();
	loadServices();
};

// 编辑：回填表单（spec 按字符串解析后铺进两段专属表单），名称与驱动锁定
const openEdit = (row: any) => {
	dialogMode.value = 'edit';
	editingName.value = row.name;
	const sp = parseGatewaySpec(row?.spec) || ({} as GatewaySpec);
	const h: HigressSpec = { domain: '', tls_secret: '', model_routes: [], rate_limit: {}, ...(sp.higress || {}) };
	const l: LiteLLMSpec = { dispatch_mode: 'api', model_list: [], key_limits: {}, fallback_chain: [], ...(sp.litellm || {}) };
	Object.assign(form, {
		type: row.type || 'ai',
		provider: (row.provider || '') as '' | GatewayProvider,
		name: row.name,
		namespace: sp.common?.namespace || row.namespace || '',
		higress: h,
		litellm: l,
		domain: row.domain || '',
		path: row.paths?.[0]?.path || '/',
		backend: row.paths?.[0]?.backend || '',
	});
	createVisible.value = true;
	loadProviders();
	loadServices();
};

const pickProvider = (p: ProviderInfo) => {
	if (!p.available) {
		showHint(p);
		return;
	}
	if (!providersMeta.ai_slot_available) {
		ElMessage.warning('该环境已有 AI 网关，一期每环境仅允许 1 个');
		return;
	}
	form.provider = p.name;
};

const showHint = (p: ProviderInfo) => {
	const html = `<div style="line-height:1.8">
		<div><b>原因：</b>${p.reason || '不可用'}</div>
		<div style="margin-top:6px"><b>处置：</b></div>
		<code style="display:block;word-break:break-all;background:#f5f7fa;padding:8px;border-radius:4px">${p.install_hint || '请联系管理员'}</code>
	</div>`;
	ElMessageBox.alert(html, `${providerText(p.name)} 不可用`, { dangerouslyUseHTMLString: true, confirmButtonText: '知道了' }).catch(() => {});
};

const submitDialog = async () => {
	if (!formRef.value) return;
	await formRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			const payload: GatewayCreatePayload = {
				type: form.type,
				name: dialogMode.value === 'edit' ? editingName.value : form.name,
				service_tree_id: dialogMode.value === 'create' ? treeStore.serviceId : undefined,
			};
			if (form.type === 'ai') {
				const provider = form.provider as GatewayProvider;
				const spec: GatewaySpec = { common: { namespace: form.namespace || '' } };
				if (provider === 'higress') {
					const h = form.higress;
					h.model_routes = (h.model_routes || []).filter((r) => r.name && r.service);
					spec.higress = h;
					payload.domain = h.domain || '';
				} else {
					const l = form.litellm;
					l.model_list = (l.model_list || []).filter((m) => m.name && m.service);
					spec.litellm = l;
				}
				// 关联推理服务按"实际被引用"登记（后端也会按 spec 反查，两处保持一致）
				spec.common.linked_services = Array.from(
					new Set([
						...(spec.higress?.model_routes || []).map((r) => r.service),
						...(spec.litellm?.model_list || []).map((m) => m.service),
					].filter(Boolean)),
				);
				payload.provider = provider;
				payload.namespace = form.namespace || undefined;
				payload.spec = spec;
			} else {
				payload.domain = form.domain;
				payload.namespace = form.namespace || undefined;
				payload.paths = [{ path: form.path, backend: form.backend }];
			}
			if (dialogMode.value === 'create') {
				await api.createGateway(payload);
				ElMessage.success('已创建（当前状态为未下发，下发能力在 M4.3 / M4.4 接入）');
			} else {
				await api.updateGateway(editingName.value, payload);
				ElMessage.success('已保存。下发与状态刷新由 M4.3 / M4.4 链路接管');
			}
			createVisible.value = false;
			loadList();
			loadProviders();
		} finally {
			submitting.value = false;
		}
	});
};

// ── M4.3 下发链路 ────────────────────────────────────────────────────────
//
// 三个动作与三个后端接口一一对应：下发（apply）/ 回收（teardown）/ 状态（state）。
// 后端在每次动作后都会把状态与新错误摘要落库，所以界面只需 loadList() 重取即可，
// 不在前端自己推状态——"页面显示的状态"和"库里的状态"必须同一个来源，否则会互相说谎。

// 集群是否具备 Gateway API CRD（能否下发的硬前置，best-effort 探测）
const apiAvail = ref<api.GatewayApiAvailable | null>(null);
const loadApiAvail = async () => {
	try {
		apiAvail.value = await api.getGatewayApiAvailable();
	} catch {
		apiAvail.value = null; // 探测失败不打扰用户（列表本身可用）
	}
};

const dispatching = ref('');
// 该环境该驱动对应的集群对象坐标（下发成功后展示，让用户知道去哪儿核对）
const gatewayObjectText = computed(() => {
	const s = detailState.value || detailManifest.value;
	if (!s?.gateway) return '-';
	return `${s.gateway_namespace}/${s.gateway}　+　${(s.route_namespaces || []).map((ns) => `${ns}/${detailManifest.value?.route_name || ''}`).join('、')}`;
});

const detailVisible = ref(false);
const detailRow = ref<any>(null);
const detailState = ref<api.GatewayStateResult | null>(null);
const detailManifest = ref<api.GatewayManifest | null>(null);
const manifestLoading = ref(false);

// 数据面监听端口：取用户 spec 里的声明（0/未声明 → 平台默认 80）。
// 刻意不从集群回读——端口填错时 Gateway 恒未就绪，回读也拿不到有意义的值；
// 这里要回答的是"我配的是多少"，那才是用户能动手改的东西。
const detailListenPort = computed(() => {
	const p = api.parseGatewaySpec(detailRow.value?.spec)?.higress?.listen_port;
	return p && p > 0 ? p : 80;
});

// 打开详情：先渲染已有快照与本地状态（抽屉立刻可用），再并发拉实时状态
const openDetail = async (row: any) => {
	detailRow.value = { ...row };
	detailState.value = null;
	detailManifest.value = null;
	detailVisible.value = true;
	if (row.type !== 'ai' || !row.provider) return;
	try {
		detailState.value = await api.getGatewayState(row.name);
		// 回读可能纠正库里的状态（如集群侧被删 → NotDeployed），同步回来看得见
		Object.assign(detailRow.value, {
			status: detailState.value.status,
			endpoint: detailState.value.endpoint || detailRow.value.endpoint,
		});
	} catch {
		// 状态回读失败（环境未接集群/CRD 缺失）保留库里的快照展示，不弹错误
	}
};

const loadManifest = async () => {
	if (!detailRow.value) return;
	manifestLoading.value = true;
	try {
		detailManifest.value = await api.previewGatewayManifest(detailRow.value.name);
	} finally {
		manifestLoading.value = false;
	}
};

// 下发：先让用户确认"聚合边界"（这条按钮会收敛整个环境的入口），再调用。
//
// force=true 是「字段所有权救援」：集群侧一旦有人用 kubectl edit / kubectl apply
// 改过平台托管的 Gateway，那个字段就归对方的 fieldManager 所有，普通 SSA 会报
// `Apply failed with 1 conflict ...` 并**永久**失败（重试多少次都一样）。
// 平台刻意不做静默覆盖——否则人工改动会无声消失——但必须给出这个显式出口，
// 否则用户只会反复看到失败而无从下手。
const handleDispatch = (row: any, force = false) => {
	const aiCount = paginator.list.filter((x) => x.type === 'ai' && x.provider).length;
	ElMessageBox.confirm(
		`将对网关 ${row.name} 执行${force ? '强制' : ''}下发。\n\n` +
			`注意：集群里的网关入口是环境级单例，本次会按「当前环境 + ${providerText(row.provider)} 驱动」聚合收敛` +
			`该环境下的全部 ${aiCount} 条记录，不只是 ${row.name}。\n` +
			`产物里没有、但带平台标签的下游对象会被回收。` +
			(force
				? `\n\n强制下发会接管被其他字段管理器（如 kubectl edit）占用的字段，覆盖集群侧的手工改动。仅在普通下发报 conflict 时使用。`
				: ''),
		force ? '确认强制下发' : '确认下发',
		{
			type: force ? 'error' : 'warning',
			confirmButtonText: force ? '强制下发' : '下发',
			cancelButtonText: '取消',
		}
	)
		.then(async () => {
			dispatching.value = row.name;
			try {
				const r = await api.applyGateway(row.name, force);
				ElMessage.success(
					`已下发 ${r.service_count ?? 0} 个服务到 ${r.gateway}` +
						`${r.listen_port ? `（监听 ${r.listen_port}）` : ''}` +
						`${r.endpoint ? `，入口 ${r.endpoint}` : ''}` +
						`${r.pruned?.length ? `；回收 ${r.pruned.length} 个过期对象` : ''}`
				);
				await loadList();
				await openDetail({ ...(paginator.list.find((x) => x.name === row.name) || row) });
			} catch {
				// 错误信息由请求拦截器统一提示；这里刷新列表把 last_error / Error 状态带出来
				await loadList();
				// 字段所有权冲突是唯一"重试永远不会成功"的失败：给明确出路
				const fresh = paginator.list.find((x) => x.name === row.name);
				if (!force && /conflict|冲突/i.test(fresh?.last_error || '')) {
					ElMessage.warning('检测到字段所有权冲突：集群侧有手工改动占用了平台字段，请用「强制下发」夺回');
				}
			} finally {
				dispatching.value = '';
			}
		})
		.catch(() => {});
};

// 回收：真删集群对象（与"删除记录"不同），必须二次确认并说清后果
const handleTeardown = (row: any) => {
	ElMessageBox.confirm(
		`确认回收网关 ${row.name} 的集群入口？\n\n` +
			`将删除集群里的入口对象与该环境全部平台托管路由，删除后该入口立刻不可用（<入口>/svc/<服务名>/v1 全部 404）。\n` +
			`平台记录会保留（状态退回未下发），可再次下发恢复。`,
		'确认回收集群入口',
		{ type: 'warning', confirmButtonText: '回收', cancelButtonText: '取消' }
	)
		.then(async () => {
			await api.teardownGateway(row.name);
			ElMessage.success(`已回收 ${row.name} 的集群入口（记录保留，可再次下发）`);
			detailVisible.value = false;
			await loadList();
		})
		.catch((e: any) => {
			// 用户点取消也会进 catch：靠错误码区分（拦截器已提示真实错误）
			if (e?.code === 20000 || e === 'cancel' || e === 'close') return;
			loadList();
		});
};

// 复制接入地址（非 HTTPS 环境下 clipboard API 不可用，回退到临时 textarea）
const copyText = async (text: string) => {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
		} else {
			const ta = document.createElement('textarea');
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		}
		ElMessage.success('已复制');
	} catch {
		ElMessage.warning('复制失败，请手动选择文本');
	}
};

const handleDelete = (row: any) => {
	ElMessageBox.confirm(
		row.type === 'ai' && row.provider
			? `确认删除网关 ${row.name}？\n\n注意：删除记录只动平台数据，**不会**回收集群里的入口对象——` +
					`若不再需要该入口，请先执行「回收」（否则集群里会留着一个平台查不到的入口在对外服务）。`
			: `确认删除网关 ${row.name}？关联的路由与插件配置将一并移除`,
		'提示',
		{ type: 'warning' }
	)
		.then(async () => {
			await api.deleteGateway(row.name);
			ElMessage.success('删除已提交');
			loadList();
			loadProviders();
		})
		.catch(() => {});
};

onMounted(() => {
	loadList();
	loadProviders();
	loadServices();
	loadApiAvail();
});

// 环境切换联动：列表 / 驱动探测 / 可引用推理服务都是环境维度的数据，
// 切换后必须重载并回到第 1 页，否则页面停留在上一个环境的结果（或空表）。
// 与 cluster/* 各页保持同一约定（X-ENV-ID 由请求拦截器自动注入）。
watch(
	() => envStore.envId,
	() => {
		paginator.page = 1;
		loadList();
		loadProviders();
		loadServices();
		// 下发能力探测也是环境维度的（探的是该环境的 Gateway API CRD 与入口对象），
		// 它驱动页面顶部的就绪/不可用提示条，不重载会停留上一个环境的结论。
		loadApiAvail();
		// 抽屉里装的是上一个环境的记录快照（detailRow 是点开那一刻的拷贝），
		// 环境已换，快照即失效——不关掉就会展示上一个环境的网关数据。
		detailVisible.value = false;
		detailRow.value = null;
		detailState.value = null;
		detailManifest.value = null;
	}
);
</script>

<style scoped lang="scss">
.na-val {
	color: #c0c4cc;
	cursor: help;
}
.drv-list {
	display: flex;
	gap: 12px;
	width: 100%;
}
.drv-card {
	flex: 1;
	padding: 10px 12px;
	border: 1px solid var(--el-border-color, #dcdfe6);
	border-radius: 6px;
	cursor: pointer;
	transition: border-color 0.2s, background 0.2s;
	&:hover { border-color: var(--el-color-primary, #409eff); }
	&.is-active {
		border-color: var(--el-color-primary, #409eff);
		background: var(--el-color-primary-light-9, #ecf5ff);
	}
	&.is-disabled {
		background: var(--el-fill-color-light, #f5f7fa);
		cursor: not-allowed;
		&:hover { border-color: var(--el-border-color, #dcdfe6); }
	}
	&__head { display: flex; align-items: center; gap: 8px; }
	&__name { font-size: 13px; font-weight: 500; }
	&__desc { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--ink-low, #909399); }
	&__hint { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--el-color-warning, #e6a23c); }
}
.form-tip { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--ink-low, #909399); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.err-val { color: var(--el-color-danger, #f56c6c); font-size: 12px; }
.sec-title { margin: 4px 0 8px; font-size: 13px; font-weight: 600; color: var(--ink-high, #303133); }
.skip-row { font-size: 12px; line-height: 1.8; }
.yaml-box {
	max-height: 320px;
	overflow: auto;
	margin: 0 0 8px;
	padding: 10px 12px;
	border: 1px solid var(--el-border-color, #dcdfe6);
	border-radius: 4px;
	background: var(--el-fill-color-light, #f5f7fa);
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 12px;
	line-height: 1.6;
	white-space: pre;
}
</style>
