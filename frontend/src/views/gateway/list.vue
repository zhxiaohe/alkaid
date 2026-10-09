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
			<el-table-column label="最近下发" width="170">
				<template #default="{ row }">
					<span v-if="row.dispatched_at">{{ row.dispatched_at }}</span>
					<span v-else class="na-val" title="平台尚未把配置下发到集群">未下发</span>
				</template>
			</el-table-column>
			<el-table-column prop="created_at" label="创建时间" width="170" />
			<el-table-column label="操作" width="180" fixed="right">
				<template #default="{ row }">
					<el-button link type="primary" @click="handleDetail(row)">详情</el-button>
					<el-button v-if="row.type === 'ai'" link type="primary" @click="openEdit(row)">编辑</el-button>
					<el-button link type="warning" @click="handleToggle(row)">{{ row.status === 'Running' ? '停用' : '启用' }}</el-button>
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
						<!-- 编辑态：驱动不可变更（provider 决定 spec 专属段形状），只读展示 -->
						<el-tag v-if="dialogMode === 'edit'" type="info" size="large">{{ providerText(form.provider) }}（不可变更）</el-tag>
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
	</div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
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

const handleDetail = (row: any) => ElMessage.info(`网关详情 ${row.name}（M4.3 起提供：下发状态 / 已签发 Key / 漂移项）`);
const handleToggle = (row: any) => ElMessage.info(`${row.status === 'Running' ? '停用' : '启用'} ${row.name}（待实现）`);
const handleDelete = (row: any) => {
	ElMessageBox.confirm(`确认删除网关 ${row.name}？关联的路由与插件配置将一并移除`, '提示', { type: 'warning' })
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
</style>
