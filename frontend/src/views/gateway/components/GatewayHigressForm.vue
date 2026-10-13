<!--
	GatewayHigressForm —— Higress 驱动专属表单（设计 §8：专属表单，不与其他驱动共用字段）
	- 只出现 Higress 的结构性配置：域名/TLS（L7）、model_routes、限流
	- 字段的显隐由能力矩阵决定（capabilities 来自 /gateway/providers/available）
	- 就地编辑父组件传入的 spec 对象（父持有 reactive，本组件只管字段、文案与校验提示）
-->
<template>
	<div class="gw-form">
		<el-form-item v-if="cap('domain_tls')" label="对外域名">
			<el-input v-model="spec.domain" placeholder="如 ai.example.com（只填主机名，不含 http:// 与路径）" />
		</el-form-item>
		<el-form-item v-if="cap('domain_tls')" label="TLS 证书">
			<el-input v-model="spec.tls_secret" placeholder="同命名空间下的证书 Secret 名，留空则注册 HTTP 监听" />
		</el-form-item>

		<!--
			数据面监听端口。Gateway 的 listener.port 不是「对外端口」，而是数据面监听端口，
			Higress controller 会拿它去 higress-gateway Service 的端口列表里按值查找：
			找不到就写 AddressNotAssigned，Gateway 恒为未就绪、入口地址为空，
			路由即便下发成功也没有实际入口。故必须让用户显式声明、与装机端口对齐。
		-->
		<el-form-item label="数据面监听端口">
			<el-input-number
				v-model="spec.listen_port"
				:min="0"
				:max="65535"
				controls-position="right"
				placeholder="80"
				style="width: 170px"
			/>
			<div class="form-tip">
				必须与集群里 higress-gateway 这个 Service 暴露的端口一致（装 Higress 时改的 gateway.httpPort 就是它）。
				留空或填 0 表示用默认 80。填错的典型症状是网关卡在「下发中」且入口地址为空——
				controller 在 Service 上找不到该端口，Gateway 永远不就绪。
			</div>
		</el-form-item>

		<el-form-item label="模型路由">
			<div class="gw-block">
				<div v-for="(r, i) in routes" :key="i" class="gw-row">
					<el-input v-model="r.name" size="small" placeholder="对外模型名" style="width: 180px" />
					<span class="gw-arrow">→</span>
					<el-select v-model="r.service" size="small" filterable placeholder="目标推理服务" style="width: 190px">
						<el-option v-for="s in services" :key="s" :label="s" :value="s" />
					</el-select>
					<el-input-number v-model="r.weight" size="small" :min="0" :max="100" controls-position="right" style="width: 110px" />
					<el-button link type="danger" size="small" @click="routes.splice(i, 1)">删除</el-button>
				</div>
				<div v-if="!routes.length" class="gw-empty">
					<div class="gw-empty__text">还没有模型路由</div>
					<div class="gw-empty__sub">添加一条，把对外模型名指向已下发的推理服务（未下发的服务会被后端拒绝）</div>
				</div>
				<el-button size="small" :icon="Plus" @click="addRoute">新增路由</el-button>
				<div class="form-tip">权重用于同名模型的多后端灰度：同名多条时权重和必须为 100，单条留空即按 100 计</div>
				<div v-if="!cap('key_ttl')" class="form-tip">
					Key 过期时间：Higress key-auth 无原生 TTL，本驱动的 key 不走过期语义（该字段不在此表单出现）
				</div>
			</div>
		</el-form-item>

		<el-form-item label="限流">
			<div class="gw-block">
				<div class="gw-row">
					<el-input-number v-model="spec.rate_limit!.rpm" size="small" :min="0" controls-position="right" style="width: 130px" />
					<span class="gw-unit">RPM（请求/分钟）</span>
					<el-input-number v-model="spec.rate_limit!.tpm" size="small" :min="0" :step="1000" controls-position="right" style="width: 150px" />
					<span class="gw-unit">TPM（token/分钟）</span>
				</div>
				<div class="form-tip">consumer 维度限流，0 或留空表示不限</div>
			</div>
		</el-form-item>
	</div>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import type { GatewayCapability, HigressSpec, ModelRoute } from '/@/api/gateway';

const props = defineProps<{
	spec: HigressSpec;
	services: string[]; // 可选推理服务名（已下发的）
	capabilities: GatewayCapability[];
}>();

// 能力矩阵查询：矩阵里没有该项时按"支持"处理（探测缺失不应把字段藏起来）
const cap = (key: string) => props.capabilities.find((c) => c.key === key)?.supported !== false;

// 保证数组/对象存在：v-for 遍历 undefined 会直接报错，这里兜底一次（父组件也会初始化）
if (!props.spec.model_routes) props.spec.model_routes = [];
if (!props.spec.rate_limit) props.spec.rate_limit = {};

// routes 取 spec.model_routes 的引用（就地编辑，无需 emit 样板）
const routes = props.spec.model_routes as ModelRoute[];

const addRoute = () => routes.push({ name: '', service: '', weight: 0 });
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
.form-tip { margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--ink-low, #909399); }
</style>
