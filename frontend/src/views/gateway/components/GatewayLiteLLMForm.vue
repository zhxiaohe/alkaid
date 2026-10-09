<!--
	GatewayLiteLLMForm —— LiteLLM 驱动专属表单（设计 §8：专属表单，不与其他驱动共用字段）
	- 只出现 LiteLLM 的结构性配置：下发通道、model_list、key 级限额、fallback 链
	- dispatch_mode 创建后不可改（改通道 = 换配置源，需新建实例），编辑态置灰
	- 能力矩阵驱动的差异：budget（LiteLLM 独有）与 domain_tls（需外层网关）在此各自呈现
-->
<template>
	<div class="gw-form">
		<el-form-item label="下发通道">
			<div class="gw-block">
				<el-radio-group v-model="spec.dispatch_mode" :disabled="lockDispatch">
					<!-- element-plus 2.3.4 取值属性是 label（value 为 2.6+，用错会静默把 model 置 undefined） -->
					<el-radio label="api">管理 API（写 Postgres，动态生效）</el-radio>
					<el-radio label="declarative">声明式（config.yaml，改完需 reload）</el-radio>
				</el-radio-group>
				<div class="form-tip">
					通道由 LiteLLM 自身的 <code>store_model_in_db</code> 决定（api = true / declarative = false）。
					<b>创建后不可修改</b>——两种模式的 model 与 key 存储位置不同，改通道等于换配置源，需新建实例。
				</div>
				<el-alert
					v-if="spec.dispatch_mode === 'declarative'"
					type="warning"
					:closable="false"
					show-icon
					class="m-t-5"
					title="声明式模式下，模型列表归平台独占"
					description="请勿在 LiteLLM Admin UI 上修改模型：下次 reload 会覆盖手工改动（这是设计约定的归属，不是 bug）"
				/>
			</div>
		</el-form-item>

		<el-form-item label="模型列表">
			<div class="gw-block">
				<div v-for="(m, i) in models" :key="i" class="gw-row">
					<el-input v-model="m.name" size="small" placeholder="对外模型名" style="width: 200px" />
					<span class="gw-arrow">→</span>
					<el-select v-model="m.service" size="small" filterable placeholder="目标推理服务" style="width: 200px">
						<el-option v-for="s in services" :key="s" :label="s" :value="s" />
					</el-select>
					<el-button link type="danger" size="small" @click="models.splice(i, 1)">删除</el-button>
				</div>
				<div v-if="!models.length" class="gw-empty">
					<div class="gw-empty__text">还没有模型</div>
					<div class="gw-empty__sub">添加一条，platform 会按目标推理服务解析 api_base（litellm_params 不需要手填）</div>
				</div>
				<el-button size="small" :icon="Plus" @click="addModel">新增模型</el-button>
			</div>
		</el-form-item>

		<el-form-item label="Key 限额">
			<div class="gw-block">
				<div class="gw-row">
					<el-input-number v-model="spec.key_limits!.rpm" size="small" :min="0" controls-position="right" style="width: 130px" />
					<span class="gw-unit">RPM（每 key 请求/分钟）</span>
					<el-input-number v-model="spec.key_limits!.tpm" size="small" :min="0" :step="1000" controls-position="right" style="width: 150px" />
					<span class="gw-unit">TPM（每 key token/分钟）</span>
				</div>
				<div class="form-tip">virtual key 级限额（key 存于 LiteLLM Postgres），0 或留空表示不限</div>
				<div v-if="cap('budget')" class="form-tip">
					预算 / 花费账本：LiteLLM 独有能力，一期仅预留字段不下发——自建推理服务没有单价，做成美元账本意义有限
				</div>
				<div v-if="cap('key_ttl')" class="form-tip">Key 过期时间由 LiteLLM 原生 expire 承担（签发 key 时填写）</div>
			</div>
		</el-form-item>

		<el-form-item label="Fallback 链">
			<div class="gw-block">
				<el-select v-model="spec.fallback_chain" multiple filterable placeholder="按顺序选择回退目标模型" style="width: 100%">
					<el-option v-for="m in modelNames" :key="m" :label="m" :value="m" />
				</el-select>
				<div class="form-tip">只能选上方已声明的模型；顺序即回退顺序（前一个失败后试下一个）</div>
			</div>
		</el-form-item>

		<el-alert
			v-if="!cap('domain_tls')"
			type="info"
			:closable="false"
			show-icon
			title="域名 / TLS 不在本驱动"
			description="LiteLLM 是应用层代理，不终结 TLS：对外域名与证书由外层 Ingress 或 Higress 承担"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import type { GatewayCapability, LiteLLMSpec, ModelDef } from '/@/api/gateway';

const props = defineProps<{
	spec: LiteLLMSpec;
	services: string[];
	capabilities: GatewayCapability[];
	lockDispatch?: boolean; // 编辑态：通道不可改
}>();

// 能力矩阵查询：矩阵里没有该项时按"支持"处理
const cap = (key: string) => props.capabilities.find((c) => c.key === key)?.supported !== false;

// 兜底初始化（v-for 遍历 undefined 会报错）
if (!props.spec.model_list) props.spec.model_list = [];
if (!props.spec.key_limits) props.spec.key_limits = {};
if (!props.spec.fallback_chain) props.spec.fallback_chain = [];
if (!props.spec.dispatch_mode) props.spec.dispatch_mode = 'api';

const models = props.spec.model_list as ModelDef[];
const modelNames = computed(() => models.map((m) => m.name).filter(Boolean));
const addModel = () => models.push({ name: '', service: '' });
</script>

<style scoped lang="scss">
.gw-block { width: 100%; }
.gw-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.gw-arrow { color: var(--ink-low, #909399); }
.gw-unit { font-size: 12px; color: var(--ink-low, #909399); }
.gw-empty {
	margin-bottom: 10px;
	padding: 14px 0;
	border: 1px dashed var(--el-border-color-lighter, #e4e7ed);
	border-radius: 6px;
	text-align: center;
	&__text { font-size: 13px; color: var(--ink, #303133); }
	&__sub { margin-top: 4px; font-size: 12px; color: var(--ink-low, #909399); }
}
.form-tip {
	margin-top: 4px;
	font-size: 12px;
	line-height: 1.6;
	color: var(--ink-low, #909399);
	code { padding: 0 3px; background: var(--el-fill-color-light, #f5f7fa); border-radius: 3px; }
}
</style>
