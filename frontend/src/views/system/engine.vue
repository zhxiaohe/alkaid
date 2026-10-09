<template>
	<div>
		<el-card shadow="never">
			<template #header>
				<div class="flex-between">
					<span><el-icon><Coin /></el-icon> 引擎镜像（base 镜像注册表）</span>
					<div class="flex-gap">
						<el-input
							v-model="keyword"
							placeholder="搜索坐标 / 镜像 / 版本"
							clearable
							size="small"
							style="width: 220px"
							@keyup.enter="fetchList"
							@clear="fetchList"
						/>
						<el-button size="small" :loading="loading" @click="fetchList">刷新</el-button>
						<el-button type="primary" size="small" @click="openDialog()">新增镜像</el-button>
					</div>
				</div>
			</template>

			<el-alert type="info" :closable="false" class="m-b-10">
				<template #title>
					推理服务的镜像、CUDA 要求、默认端口与参数表单，全部由本表下发（<b>服务只提交 engine_id</b>）。
					改动<b>只影响新建/变更的服务</b>：存量服务按创建时的镜像快照运行，不会被回改。
				</template>
			</el-alert>

			<el-table
				:data="list"
				border
				stripe
				v-loading="loading"
				highlight-current-row
				:row-class-name="rowClassName"
				@row-click="selectRow"
			>
				<el-table-column prop="display" label="平台/引擎坐标" min-width="230">
					<template #default="{ row }">
						<span class="mono">{{ row.display }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="engine" label="引擎" width="90" />
				<el-table-column prop="cuda_requirement" label="CUDA" width="80" align="center">
					<template #default="{ row }">
						<span v-if="row.cuda_requirement">{{ row.cuda_requirement }}</span>
						<span v-else class="na-val">未标注</span>
					</template>
				</el-table-column>
				<el-table-column prop="image" label="镜像" min-width="230" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="mono">{{ row.image }}</span>
					</template>
				</el-table-column>
				<el-table-column label="端口" width="80" align="center">
					<template #default="{ row }">{{ row.default_port }}</template>
				</el-table-column>
				<el-table-column label="参数" width="80" align="center">
					<template #default="{ row }">{{ (row.param_schema || []).length }}</template>
				</el-table-column>
				<el-table-column label="状态" width="120" align="center">
					<template #default="{ row }">
						<el-switch v-model="row.status" @change="toggleStatus(row)" />
						<span class="status-text">{{ row.status ? '可选' : '已下架' }}</span>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="180" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" size="small" @click.stop="openDialog(row)">编辑</el-button>
						<el-button link type="primary" size="small" @click.stop="selectRow(row)">参数</el-button>
						<el-popconfirm
							title="确认删除该镜像行？被推理服务引用时后端会拒绝删除。"
							@confirm="handleDelete(row)"
						>
							<template #reference>
								<el-button link type="danger" size="small" @click.stop>删除</el-button>
							</template>
						</el-popconfirm>
					</template>
				</el-table-column>
			</el-table>
		</el-card>

		<!-- 选中行的参数契约（param_schema 是该引擎的"表单即契约"） -->
		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="flex-between">
					<span>
						参数契约
						<template v-if="current">
							<el-tag size="small" type="info" class="m-l-10">{{ current.display }}</el-tag>
							<span class="sub">{{ current.engine }} · 默认端口 {{ current.default_port }}</span>
						</template>
						<span v-else class="empty-tip">（点击上方镜像行查看其参数契约）</span>
					</span>
				</div>
			</template>
			<el-table v-if="current" :data="current.param_schema || []" border stripe size="small">
				<el-table-column prop="key" label="参数键" width="180">
					<template #default="{ row }">
						<span class="mono">{{ row.key }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="flag" label="对应 flag" width="220">
					<template #default="{ row }">
						<span class="mono">{{ row.flag }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="type" label="类型" width="90" />
				<el-table-column label="取值" min-width="200">
					<template #default="{ row }">{{ rangeText(row) }}</template>
				</el-table-column>
				<el-table-column label="默认值" width="130">
					<template #default="{ row }">
						<span class="mono">{{ defaultText(row.key) }}</span>
					</template>
				</el-table-column>
				<el-table-column label="高级" width="70" align="center">
					<template #default="{ row }">{{ row.advanced ? '是' : '否' }}</template>
				</el-table-column>
				<el-table-column prop="tip" label="说明" min-width="220" show-overflow-tooltip />
			</el-table>
			<el-empty v-else description="未选择镜像行" :image-size="60" />
		</el-card>

		<!-- 启动契约：镜像"怎么起来"。缺了它，容器只有 args、entrypoint 只能靠镜像自带 -->
		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="flex-between">
					<span>
						启动契约
						<template v-if="current">
							<el-tag size="small" type="info" class="m-l-10">{{ current.display }}</el-tag>
						</template>
						<span v-else class="empty-tip">（点击上方镜像行查看其启动方式）</span>
					</span>
				</div>
			</template>
			<template v-if="current">
				<!-- 告警按「是否声明过」判定，而不是按「有没有命令」：
				     command 为空数组是管理员显式选择「用镜像自带 ENTRYPOINT」的合法配置，不是问题；
				     反过来，未声明时即便内置兜底补出了命令，也值得提示一次来源。 -->
				<el-alert
					v-if="!current.command_configured && !current.command.length"
					type="warning"
					:closable="false"
					class="m-b-10"
				>
					<template #title>
						该行<b>未声明启动契约</b>，容器命令只能由镜像自带的 ENTRYPOINT 决定。
						如果这个镜像本身没有 ENTRYPOINT/CMD（如 SGLang 官方镜像），Pod 会正常调度起来但<b>不会启动引擎</b>，
						而平台侧（创建/下发/快照）全都返回成功 —— 只有 Pod 日志里能看到真相。
						请点「编辑」指定启动命令；若确认该镜像自带 ENTRYPOINT，也可选「用镜像自带 ENTRYPOINT」把它显式声明下来。
					</template>
				</el-alert>
				<el-alert v-else-if="!current.command_configured" type="info" :closable="false" class="m-b-10">
					<template #title>
						该行<b>未声明启动契约</b>，下方显示的是<b>引擎内置默认</b>（按 schema_key 推导，不是本行配置的值）。
						内置兜底只服务"从未声明过"的历史行，建议点「编辑」确认一次，避免下发行为依赖隐式约定。
					</template>
				</el-alert>
				<el-descriptions :column="1" border size="small">
					<el-descriptions-item label="启动方式">
						<!-- 来源要分清楚：镜像自带 / 引擎内置默认 / 平台显式指定 -->
						<el-tag v-if="!current.command.length" size="small" type="info">镜像自带 ENTRYPOINT</el-tag>
						<el-tag v-else-if="!current.command_configured" size="small" type="warning" effect="plain">
							引擎内置默认
						</el-tag>
						<el-tag v-else size="small" type="success">平台显式指定</el-tag>
						<el-tag size="small" :type="current.command_configured ? '' : 'warning'" effect="plain" class="m-l-10">
							{{ current.command_configured ? '已在本行声明' : '未声明' }}
						</el-tag>
					</el-descriptions-item>
					<el-descriptions-item label="启动命令">
						<span v-if="!current.command.length" class="na-val">（继承镜像 ENTRYPOINT，平台不覆盖）</span>
						<span v-else class="mono">{{ current.command.join(' ') }}</span>
						<span class="sub">
							{{ current.command_configured ? 'K8s 的 container.command' : '引擎内置默认（未在本行声明）' }}
						</span>
					</el-descriptions-item>
					<el-descriptions-item label="权重路径 flag">
						<span class="mono">{{ current.model_flag }}</span>
						<span class="sub">指向版本目录，由平台注入</span>
					</el-descriptions-item>
					<el-descriptions-item label="并行度 flag">
						<span class="mono">{{ current.tp_flag }}</span>
						<span class="sub">平台按 gpu_per_replica 注入（单卡不注入）</span>
					</el-descriptions-item>
				</el-descriptions>
				<div class="form-hint">
					容器最终执行的命令 = <b>启动命令（container.command）</b> + 推理服务渲染出的参数。
					没有这一行，SGLang 这类"镜像不带 ENTRYPOINT"的引擎起来后不会启动服务端。
				</div>
			</template>
			<el-empty v-else description="未选择镜像行" :image-size="60" />
		</el-card>

		<!-- 环境级镜像覆盖：同一条注册表行在不同环境可用不同镜像地址（dev/prod 各自的 registry） -->
		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="flex-between">
					<span>
						环境镜像覆盖
						<template v-if="current">
							<el-tag size="small" type="info" class="m-l-10">{{ current.display }}</el-tag>
						</template>
						<span v-else class="empty-tip">（点击上方镜像行后配置）</span>
					</span>
				</div>
			</template>
			<el-alert type="info" :closable="false" class="m-b-10">
				<template #title>
					不同环境可以拉取不同的 registry（如 dev 走 <span class="mono">registry.dev.local</span>、生产走 <span class="mono">registry.prod.local</span>）。
					未配置的环境<b>回退上表的默认镜像</b>。改动只影响<b>新建/变更</b>的服务：存量服务按创建时的镜像快照运行。
				</template>
			</el-alert>
			<el-table v-if="current" :data="envRows" border stripe size="small">
				<el-table-column label="环境" width="180">
					<template #default="{ row }">
						<span>{{ row.name }}</span>
						<span class="sub">{{ row.code }}</span>
					</template>
				</el-table-column>
				<el-table-column label="实际下发镜像" min-width="280">
					<template #default="{ row }">
						<span class="mono">{{ row.effectiveImage }}</span>
					</template>
				</el-table-column>
				<el-table-column label="来源" width="100" align="center">
					<template #default="{ row }">
						<el-tag v-if="row.override" size="small" type="warning">环境覆盖</el-tag>
						<el-tag v-else size="small" type="info">默认</el-tag>
					</template>
				</el-table-column>
				<el-table-column label="备注" min-width="160" show-overflow-tooltip>
					<template #default="{ row }">{{ row.override?.remark || '—' }}</template>
				</el-table-column>
				<el-table-column label="操作" width="150" fixed="right">
					<template #default="{ row }">
						<el-button link type="primary" size="small" @click="openEnvDialog(row)">
							{{ row.override ? '修改' : '设置覆盖' }}
						</el-button>
						<el-popconfirm
							v-if="row.override"
							title="清除后该环境回退使用默认镜像，确认？"
							@confirm="clearEnvOverride(row)"
						>
							<template #reference>
								<el-button link type="danger" size="small">清除</el-button>
							</template>
						</el-popconfirm>
					</template>
				</el-table-column>
			</el-table>
			<el-empty v-else description="未选择镜像行" :image-size="60" />
		</el-card>

		<!-- 新增 / 编辑 -->
		<el-dialog
			v-model="dialogVisible"
			:title="editing ? '编辑引擎镜像' : '新增引擎镜像'"
			width="760px"
			:close-on-click-modal="false"
		>
			<el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
				<el-form-item label="平台坐标" prop="platform">
					<el-select v-model="form.platform" style="width: 100%" filterable allow-create>
						<el-option v-for="p in platformPresets" :key="p" :label="p" :value="p" />
					</el-select>
				</el-form-item>
				<el-form-item label="引擎标识" prop="engine_key">
					<el-input v-model="form.engine_key" placeholder="小写标识，如 vllm / sglang" :disabled="editing" />
				</el-form-item>
				<el-form-item label="引擎展示名" prop="engine">
					<el-input v-model="form.engine" placeholder="如 vLLM / SGLang（表单标题展示用）" />
				</el-form-item>
				<el-form-item label="版本" prop="version">
					<el-input v-model="form.version" placeholder="如 0.9.2" :disabled="editing" />
				</el-form-item>
				<el-form-item label="镜像地址" prop="image">
					<el-input v-model="form.image" placeholder="如 registry.local/llm/vllm-openai:v0.9.2" />
				</el-form-item>
				<el-form-item label="CUDA 要求" prop="cuda_requirement">
					<el-input v-model="form.cuda_requirement" placeholder="镜像自带 runtime，如 12.4（用于与节点池驱动比对）" style="width: 100%" />
				</el-form-item>
				<el-form-item label="默认端口" prop="default_port">
					<el-input-number v-model="form.default_port" :min="1" :max="65535" />
					<span class="form-hint">vLLM 8000 / SGLang 30000：服务端口与探针端口同源</span>
				</el-form-item>
				<el-form-item label="启动方式">
					<!-- element-plus 2.3.x 的 el-radio 用 label 承载值（2.6+ 才改名 value） -->
					<el-radio-group v-model="commandMode">
						<el-radio label="default">跟随引擎默认</el-radio>
						<el-radio label="inherit">用镜像自带 ENTRYPOINT</el-radio>
						<el-radio label="custom">自定义命令</el-radio>
					</el-radio-group>
					<div class="form-hint">
						<b>怎么起来</b>决定了容器最终执行的命令：K8s 实际 argv = <span class="mono">container.command</span>（此处）
						+ 平台渲染的 args。<br />
						「跟随引擎默认」＝不指定，按引擎内置约定（vLLM 用镜像自带 ENTRYPOINT；SGLang 显式拉起
						<span class="mono">python3 -m sglang.launch_server</span>）。
						「用镜像自带 ENTRYPOINT」＝显式不覆盖（适合自建镜像）。
						<b>镜像若没有 ENTRYPOINT/CMD 且选了后者，Pod 起来也不会启动引擎</b>。
					</div>
				</el-form-item>
				<el-form-item v-if="commandMode === 'custom'" label="启动命令">
					<el-input
						v-model="commandText"
						type="textarea"
						:rows="3"
						class="mono-input"
						placeholder="每行一个参数，例如：&#10;python3&#10;-m&#10;sglang.launch_server"
					/>
					<div class="form-hint">
						每行一个 argv 元素，<b>不要把整条命令写在一行</b>（那会被当成可执行文件全名而启动失败）。
						需要 shell 语义时写三行：<span class="mono">sh</span> / <span class="mono">-c</span> / <span class="mono">exec python3 …</span>
					</div>
				</el-form-item>
				<el-form-item label="权重路径 flag">
					<el-input v-model="form.model_flag" placeholder="留空 = 按引擎默认（vLLM --model / SGLang --model-path）" />
					<div class="form-hint">
						模型路径的 flag 名。该 flag 由平台注入，<b>不要写进参数 schema</b>。
						SGLang 只有 <span class="mono">--model-path</span>，传 <span class="mono">--model</span> 会被判为未知参数直接退出。
					</div>
				</el-form-item>
				<el-form-item label="并行度 flag">
					<el-input v-model="form.tp_flag" placeholder="留空 = 按引擎默认（vLLM --tensor-parallel-size / SGLang --tp）" />
					<div class="form-hint">平台按 gpu_per_replica 注入该 flag（单卡不注入），用户不可在参数里覆盖。</div>
				</el-form-item>
				<el-form-item label="参数 schema">
					<el-input
						v-model="schemaText"
						type="textarea"
						:rows="10"
						class="mono-input"
						placeholder='[{"key":"dtype","label":"计算精度（--dtype）","flag":"--dtype","type":"select","options":["auto","bfloat16"]}]'
					/>
					<div class="form-hint">
						JSON 数组，字段：key / label / flag / type（select|number|switch|text）/ options / min / max / step / tip / advanced / cross_max。
						flag 必须等于 key 的 kebab 形式（如 max_model_len → --max-model-len）；host / port / model / served_model_name 由平台托管，禁止出现。
						<b>填错会直接拦住推理表单</b>，保存前后端都会做结构校验。
					</div>
				</el-form-item>
				<el-form-item label="默认参数值">
					<el-input
						v-model="paramsText"
						type="textarea"
						:rows="6"
						class="mono-input"
						placeholder='{"dtype":"bfloat16","max_model_len":32768}'
					/>
					<div class="form-hint">JSON 对象，键必须落在上方 schema 内；新建推理服务时表单的初始值。</div>
				</el-form-item>
				<el-form-item label="排序">
					<el-input-number v-model="form.sort" :min="0" :max="9999" />
				</el-form-item>
				<el-form-item label="备注">
					<el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选，如适配的卡型/驱动说明" />
				</el-form-item>
				<el-form-item label="启用状态">
					<el-switch v-model="form.status" />
					<span class="form-hint">下架后不可用于新建服务，存量服务照常渲染/重启</span>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="dialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="handleSubmit">
					{{ editing ? '保存' : '创建' }}
				</el-button>
			</template>
		</el-dialog>
		<!-- 环境覆盖编辑 -->
		<el-dialog v-model="envDialogVisible" :title="`环境镜像覆盖 · ${envForm.env_name}`" width="620px" :close-on-click-modal="false">
			<el-form ref="envFormRef" :model="envForm" :rules="envRules" label-width="110px">
				<el-form-item label="环境">
					<el-tag size="small" type="info">{{ envForm.env_name }}（{{ envForm.env_code }}）</el-tag>
				</el-form-item>
				<el-form-item label="镜像地址" prop="image">
					<el-input v-model="envForm.image" class="mono-input" placeholder="如 registry.prod.local/llm/vllm-openai:v0.9.2" />
					<div class="form-hint">
						该环境下实际下发的镜像（可含 registry 域名/端口/tag/digest）。清除覆盖即回退默认镜像
						<span class="mono">{{ current?.image }}</span>。
					</div>
				</el-form-item>
				<el-form-item label="备注">
					<el-input v-model="envForm.remark" type="textarea" :rows="2" placeholder="可选，如：生产走私有 mirror，仅同步该 tag" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="envDialogVisible = false">取消</el-button>
				<el-button type="primary" :loading="envSubmitting" @click="submitEnvOverride">保存</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Coin } from '@element-plus/icons-vue';
import {
	getEngineImages,
	createEngineImage,
	updateEngineImage,
	deleteEngineImage,
	saveEnvImage,
	deleteEnvImage,
	type EngineImage,
	type EngineImageEnv,
	type EngineImagePayload,
	type ParamField,
	type CommandMode,
} from '/@/api/engine';
import { getEnvListAll, type EnvItem } from '/@/api/env';
import { useEngineRegistryStore } from '/@/stores/engineRegistry';

const engineStore = useEngineRegistryStore();

const platformPresets = ['linux/amd64/nvidia', 'linux/amd64/ascend', 'linux/amd64/metax', 'linux/arm64/metax'];

const list = ref<EngineImage[]>([]);
const loading = ref(false);
const keyword = ref('');
const current = ref<EngineImage | null>(null);

const rowClassName = ({ row }: { row: EngineImage }) => (current.value?.id === row.id ? 'engine-row-current' : '');

async function fetchList() {
	loading.value = true;
	try {
		list.value = (await getEngineImages({ keyword: keyword.value.trim() || undefined })) as unknown as EngineImage[];
		// 当前选中行可能已被改名，回写
		if (current.value) current.value = list.value.find((r) => r.id === current.value?.id) || null;
	} catch {
		/* 拦截器已处理 */
	} finally {
		loading.value = false;
	}
}

function selectRow(row: EngineImage) {
	current.value = row;
}

const rangeText = (f: ParamField) => {
	if (f.type === 'select') return (f.options || []).join(' / ') || '—';
	if (f.type === 'number') {
		if (f.min === undefined && f.max === undefined) return '数值';
		return `${f.min ?? '-∞'} ~ ${f.max ?? '+∞'}${f.step ? `（步长 ${f.step}）` : ''}`;
	}
	if (f.type === 'switch') return '开 / 关';
	return '文本';
};

const defaultText = (key: string) => {
	const v = current.value?.default_params?.[key];
	if (v === undefined || v === null) return '—';
	if (typeof v === 'boolean') return v ? '开' : '关';
	if (v === '') return '（空）';
	return String(v);
};

// ----- 弹窗 -----
const dialogVisible = ref(false);
const editing = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = ref<EngineImagePayload & { id?: number }>({});
const schemaText = ref('[]');
const paramsText = ref('{}');
// 启动契约三态（与后端 launch.go 一一对应，见 api/engine.ts 的 CommandMode）：
//   default  发 null → 列留空 = 未声明，渲染时回落引擎内置默认
//   inherit  发 []   → 显式"用镜像自带 ENTRYPOINT"，不被兜底复活
//   custom   发 [...] → 显式命令（每行一个 argv 元素）
const commandMode = ref<CommandMode>('default');
const commandText = ref('');

const rules: FormRules = {
	platform: [{ required: true, message: '请选择平台坐标', trigger: 'change' }],
	engine_key: [
		{ required: true, message: '请输入引擎标识', trigger: 'blur' },
		{ pattern: /^[a-z][a-z0-9_-]*$/, message: '小写字母开头，仅含小写字母/数字/下划线/中划线', trigger: 'blur' },
	],
	engine: [{ required: true, message: '请输入引擎展示名', trigger: 'blur' }],
	version: [{ required: true, message: '请输入版本', trigger: 'blur' }],
	image: [{ required: true, message: '请输入镜像地址', trigger: 'blur' }],
	default_port: [{ required: true, message: '请输入默认端口', trigger: 'change' }],
};

function openDialog(row?: EngineImage) {
	editing.value = !!row;
	if (row) {
		form.value = {
			id: row.id,
			platform: row.platform,
			engine_key: row.engine_key,
			engine: row.engine,
			version: row.version,
			schema: row.schema,
			image: row.image,
			cuda_requirement: row.cuda_requirement,
			default_port: row.default_port,
			status: row.status,
			sort: row.sort,
			remark: row.remark || '',
			// 用"生效值"打底（DTO 已经含内置兜底）：管理员看到的就是真正会下发的 flag，
			// 清空输入框即回落内置默认
			model_flag: row.model_flag,
			tp_flag: row.tp_flag,
		};
		// 未声明 → default；已声明但为空数组 → inherit；否则 custom
		commandMode.value = !row.command_configured ? 'default' : row.command.length ? 'custom' : 'inherit';
		commandText.value = (row.command || []).join('\n');
		schemaText.value = JSON.stringify(row.param_schema || [], null, 2);
		paramsText.value = JSON.stringify(row.default_params || {}, null, 2);
	} else {
		form.value = {
			platform: 'linux/amd64/nvidia',
			engine_key: '',
			engine: '',
			version: '',
			image: '',
			cuda_requirement: '',
			default_port: 8000,
			status: true,
			sort: (list.value.reduce((m, r) => Math.max(m, r.sort || 0), 0) || 0) + 10,
			remark: '',
			model_flag: '',
			tp_flag: '',
		};
		commandMode.value = 'default';
		commandText.value = '';
		schemaText.value = '[]';
		paramsText.value = '{}';
	}
	dialogVisible.value = true;
}

// 命令行 → argv 数组：每行一个元素（比让用户写 JSON 少一层转义错误）
const parseCommand = (): { ok: true; value: string[] } | { ok: false; error: string } => {
	const lines = commandText.value
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (!lines.length) return { ok: false, error: '请填写启动命令（每行一个参数）' };
	if (lines.length === 1 && /\s/.test(lines[0])) {
		return {
			ok: false,
			error: `启动命令只有一个元素且含空格（${lines[0]}）：请拆成多行（如 python3 / -m / sglang.launch_server），单行整条命令会被当成可执行文件全名而启动失败`,
		};
	}
	return { ok: true, value: lines };
};

// 解析两个 JSON 编辑器（错误在提交前暴露，避免把半截 JSON 发到后端）
const parseJSON = <T,>(text: string, label: string): { ok: true; value: T } | { ok: false; error: string } => {
	try {
		return { ok: true, value: JSON.parse(text || (label === 'param_schema' ? '[]' : '{}')) as T };
	} catch (e) {
		return { ok: false, error: `${label} 不是合法 JSON：${(e as Error).message}` };
	}
};

async function handleSubmit() {
	if (!formRef.value) return;
	const parsedSchema = parseJSON<unknown>(schemaText.value, 'param_schema');
	if (!parsedSchema.ok) return ElMessage.warning(parsedSchema.error);
	if (!Array.isArray(parsedSchema.value)) return ElMessage.warning('param_schema 必须是 JSON 数组');
	const paramSchema = parsedSchema.value as ParamField[];

	const parsedParams = parseJSON<unknown>(paramsText.value, 'default_params');
	if (!parsedParams.ok) return ElMessage.warning(parsedParams.error);
	const rawParams = parsedParams.value;
	if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
		return ElMessage.warning('default_params 必须是 JSON 对象');
	}
	const defaultParams = rawParams as Record<string, unknown>;

	// 启动契约三态（与后端 launch.go / engine_image.go 的 command 列一一对应）：
	//   default 发 null → 列写 SQL NULL = 未声明，渲染时由 Launch() 回落引擎内置默认
	//   inherit 发 []   → 显式"用镜像自带 ENTRYPOINT"，不被兜底复活
	//   custom  发 [...] → 显式命令（每行一个 argv 元素）
	// 三态都必须能表达：把 null 与 [] 合并会让管理员无法说"请不要覆盖镜像的 ENTRYPOINT"。
	let command: string[] | null = null;
	if (commandMode.value === 'custom') {
		const parsedCommand = parseCommand();
		if (!parsedCommand.ok) return ElMessage.warning(parsedCommand.error);
		command = parsedCommand.value;
	} else if (commandMode.value === 'inherit') {
		command = [];
	}

	await formRef.value.validate(async (valid) => {
		if (!valid) return;
		submitting.value = true;
		try {
			// 显式装配（不用 {...form}）：id 由路径携带，避免把表单里的 id 又塞回 body
			const payload: EngineImagePayload = {
				platform: form.value.platform,
				engine_key: form.value.engine_key,
				engine: form.value.engine,
				version: form.value.version,
				schema: form.value.schema,
				image: form.value.image,
				cuda_requirement: form.value.cuda_requirement,
				default_port: form.value.default_port,
				status: form.value.status,
				sort: form.value.sort,
				remark: form.value.remark,
				param_schema: paramSchema,
				default_params: defaultParams,
				// 空串 = 回落引擎内置默认（后端 Launch() 按 schema_key 兜底）
				model_flag: (form.value.model_flag || '').trim(),
				tp_flag: (form.value.tp_flag || '').trim(),
				command,
			};
			if (editing.value && form.value.id) {
				const res = (await updateEngineImage(form.value.id, payload)) as { referenced?: number };
				if (res?.referenced) {
					ElMessage.success(`已保存：该镜像被 ${res.referenced} 个推理服务引用，它们仍按创建时的镜像快照运行`);
				} else {
					ElMessage.success('保存成功');
				}
			} else {
				await createEngineImage(payload);
				ElMessage.success('创建成功');
			}
			dialogVisible.value = false;
			await fetchList();
			await engineStore.ensureLoaded(true); // 同步共享缓存，推理创建页立即看到
		} catch {
			/* 拦截器已处理（含被引用不可删、参数非法等业务码） */
		} finally {
			submitting.value = false;
		}
	});
}

// ----- 环境镜像覆盖 -----
// 环境列表（含禁用）：覆盖是"某环境拉什么镜像"，禁用环境的历史覆盖也要能看见并清理
const envs = ref<EnvItem[]>([]);
// 表格数据源：每个环境一行，带上该环境的覆盖行（无覆盖=回退默认镜像）
const envRows = computed(() =>
	envs.value.map((e) => {
		const override = engineStore.envImages[current.value?.id || 0]?.find((r) => r.env_id === e.id) || null;
		return {
			...e,
			override,
			effectiveImage: override?.image || current.value?.image || '',
		};
	})
);

const envDialogVisible = ref(false);
const envSubmitting = ref(false);
const envFormRef = ref<FormInstance>();
const envForm = ref<{ env_id: number; env_name: string; env_code: string; image: string; remark: string }>({
	env_id: 0, env_name: '', env_code: '', image: '', remark: '',
});
const envRules: FormRules = {
	image: [{ required: true, message: '请输入该环境的镜像地址', trigger: 'blur' }],
};

function openEnvDialog(row: { id: number; name: string; code: string; override: EngineImageEnv | null }) {
	envForm.value = {
		env_id: row.id,
		env_name: row.name,
		env_code: row.code,
		// 打底：已有覆盖用覆盖值，没有则给注册表默认镜像（多数环境只是改个 registry 域名）
		image: row.override?.image || current.value?.image || '',
		remark: row.override?.remark || '',
	};
	envDialogVisible.value = true;
}

async function submitEnvOverride() {
	if (!envFormRef.value || !current.value) return;
	await envFormRef.value.validate(async (valid) => {
		if (!valid) return;
		envSubmitting.value = true;
		try {
			await saveEnvImage(current.value!.id, envForm.value.env_id, {
				image: envForm.value.image.trim(),
				remark: envForm.value.remark,
			});
			ElMessage.success(`已保存：${envForm.value.env_name} 环境将使用该镜像地址（仅影响新建/变更的服务）`);
			envDialogVisible.value = false;
			await engineStore.ensureLoaded(true); // 同步共享缓存，创建页立即按新地址展示
		} catch {
			/* 拦截器已处理（地址非法等） */
		} finally {
			envSubmitting.value = false;
		}
	});
}

async function clearEnvOverride(row: { id: number; name: string }) {
	if (!current.value) return;
	try {
		await deleteEnvImage(current.value.id, row.id);
		ElMessage.success(`已清除 ${row.name} 环境的覆盖，将回退默认镜像`);
		await engineStore.ensureLoaded(true);
	} catch {
		/* 拦截器已处理 */
	}
}

async function handleDelete(row: EngineImage) {
	try {
		await deleteEngineImage(row.id);
		ElMessage.success('删除成功');
		if (current.value?.id === row.id) current.value = null;
		await fetchList();
		await engineStore.ensureLoaded(true);
	} catch {
		/* 拦截器已处理：41303 表示仍被推理服务引用 */
	}
}

async function toggleStatus(row: EngineImage) {
	try {
		await updateEngineImage(row.id, { status: row.status });
		ElMessage.success(row.status ? '已启用（可用于新建服务）' : '已下架（仅存量服务可用）');
		await engineStore.ensureLoaded(true);
	} catch {
		row.status = !row.status;
	}
}

onMounted(async () => {
	await fetchList();
	await engineStore.ensureLoaded(true); // 注册表 + 环境覆盖一起进缓存
	try {
		envs.value = (await getEnvListAll()) as unknown as EnvItem[];
	} catch {
		/* 拦截器已处理：环境列表拉不到时该卡片为空，不影响注册表本身 */
	}
	if (list.value.length && !current.value) selectRow(list.value[0]);
});
</script>

<style scoped lang="scss">
.flex-between {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.flex-gap {
	display: flex;
	align-items: center;
	gap: 10px;
}
.m-b-10 { margin-bottom: 10px; }
.m-t-15 { margin-top: 15px; }
.m-l-10 { margin-left: 10px; }
.mono {
	font-family: var(--el-font-family-mono, monospace);
	font-size: 12px;
}
.mono-input :deep(textarea) {
	font-family: var(--el-font-family-mono, monospace);
	font-size: 12px;
	line-height: 1.5;
}
.sub {
	margin-left: 10px;
	font-size: 13px;
	color: #606266;
}
.empty-tip {
	margin-left: 10px;
	font-size: 13px;
	color: #909399;
}
.na-val {
	color: #909399;
}
.status-text {
	margin-left: 6px;
	font-size: 12px;
	color: #909399;
}
.form-hint {
	margin-top: 4px;
	font-size: 12px;
	color: #909399;
	line-height: 1.6;
}
:deep(.el-table__row) {
	cursor: pointer;
}
:deep(.engine-row-current td) {
	background-color: var(--el-color-primary-light-9) !important;
}
</style>
