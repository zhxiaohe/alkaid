<template>
	<div>
		<el-alert
			v-if="!treeStore.hasSelected"
			title="请先在左侧服务树选择一个服务节点（叶子节点），再查看推理服务列表"
			type="info"
			:closable="false"
			show-icon
			class="m-b-15"
		/>
		<div class="flex-between m-b-15">
			<el-input v-model="keyword" placeholder="搜索服务名" style="width: 240px" clearable @keyup.enter="loadList" />
			<el-button type="primary" :icon="Plus" :disabled="!treeStore.hasSelected" @click="openCreate()">新建推理服务</el-button>
		</div>
		<el-table :data="paginator.list" border stripe v-loading="loading" @row-click="goDetail">
			<el-table-column prop="name" label="服务名" min-width="140" />
			<el-table-column prop="model" label="模型" min-width="160" />
			<el-table-column prop="framework" label="框架" width="100" />
			<el-table-column prop="replicas" label="副本" width="80" align="center" />
			<el-table-column prop="gpu_per_replica" label="GPU/副本" width="100" align="center" />
			<el-table-column label="状态" width="100" align="center">
				<template #default="{ row }">
					<el-tag :type="row.status === 'Running' ? 'success' : statusTagType(row.status)">{{ row.status }}</el-tag>
				</template>
			</el-table-column>
			<el-table-column prop="endpoint" label="访问地址" min-width="200" show-overflow-tooltip />
			<!-- 网关代理（服务视角）：gateway_name 由后端按 AI 网关引用关系填充 -->
			<el-table-column label="网关代理" width="130" align="center">
				<template #default="{ row }">
					<el-tooltip v-if="row.gateway_name" :content="`模型路由挂在网关 ${row.gateway_name} 上`" placement="top">
						<el-tag type="success" size="small">已代理</el-tag>
					</el-tooltip>
					<span v-else class="na-val">未接入</span>
				</template>
			</el-table-column>
			<el-table-column label="操作" width="300" fixed="right">
				<template #default="{ row }">
					<el-button link type="primary" @click.stop="goDetail(row)">详情</el-button>
					<el-tooltip v-if="isAutoscale(row)" content="弹性策略已启用，副本由 KEDA 托管，请在详情页调整弹性策略" placement="top">
							<el-button link type="info" disabled>扩缩</el-button>
						</el-tooltip>
						<el-button v-else link type="primary" @click.stop="openScale(row)">扩缩</el-button>
					<el-button link type="warning" @click.stop="handleUpdate(row)">更新</el-button>
					<el-button v-if="!row.gateway_name && row.status === 'Running'" link type="success" @click.stop="openGwOnboard(row)">接入网关</el-button>
					<el-button v-else-if="row.gateway_name" link type="success" @click.stop="openGwConfig(row)">网关配置</el-button>
					<el-button link type="danger" @click.stop="handleDelete(row)">删除</el-button>
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
			:page-sizes="[10, 20, 50, 100]"
			@size-change="(sz) => { paginator.size = sz; paginator.page = 1; loadList() }"
			@current-change="(p) => { paginator.page = p; loadList() }"
		/>

		<!-- 网关接入（服务视角）：有可用网关则挂模型路由，没有则就地创建并接入 —— 一条闭环路径 -->
		<el-dialog v-model="gwOnboardVisible" title="网关接入" width="520px" :close-on-click-modal="false">
			<el-alert v-if="gwMode === 'attach'" type="info" :closable="false" show-icon class="m-b-15"
				title="代理以「模型路由」形式挂在网关上：把本服务追加为所选网关的一条路由。" />
			<el-alert v-else type="warning" :closable="false" show-icon class="m-b-15"
				title="该环境还没有可用的 AI 网关（或均为未指定驱动的旧记录），将为本服务就地创建一个网关并接入。" />
			<el-form label-width="110px" v-loading="gwLoading">
				<el-form-item label="目标服务">
					<el-input :model-value="gwOnboard.service" disabled />
				</el-form-item>
				<template v-if="gwMode === 'attach'">
					<el-form-item label="目标网关">
						<el-select v-model="gwTarget" style="width: 100%">
							<el-option v-for="g in gwCandidates" :key="g.name" :value="g.name"
								:label="`${g.name}（${g.provider === 'higress' ? 'Higress' : g.provider === 'litellm' ? 'LiteLLM' : g.provider}）`" />
						</el-select>
					</el-form-item>
				</template>
				<template v-else>
					<el-form-item label="网关名称">
						<el-input v-model="gwNew.name" placeholder="环境内唯一，如 gw-translate" />
					</el-form-item>
					<el-form-item label="接入驱动">
						<el-select v-model="gwNew.provider" style="width: 100%">
							<el-option v-for="p in gwAvailable" :key="p.name" :value="p.name"
								:label="`${p.name === 'higress' ? 'Higress' : 'LiteLLM'}${p.available ? '' : '（未检测到，下发前需先安装）'}`" />
						</el-select>
					</el-form-item>
					<el-form-item v-if="gwNew.provider === 'higress'" label="对外域名">
						<el-input v-model="gwNew.domain" placeholder="可选，如 gw.example.com（不含 http:// 与路径）" />
					</el-form-item>
				</template>
				<el-form-item label="对外模型名">
					<el-input v-model="gwOnboard.model" placeholder="客户端请求里的 model 字段（默认同服务名）" />
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="gwOnboardVisible = false">取消</el-button>
				<el-button type="primary" :loading="gwOnboardSubmitting" @click="submitGwOnboard">
					{{ gwMode === 'attach' ? '接入' : '创建并接入' }}
				</el-button>
			</template>
		</el-dialog>

		<!-- 网关配置（服务视角）：展示引用了本服务的网关及其路由，域名/路由可在服务侧直接调整。
		     编辑走网关整体 PUT（spec 是唯一权威源）；只允许删本服务的路由，其他服务的路由归网关管理页管 -->
		<el-drawer v-model="gwCfgVisible" title="网关配置" size="620px" :close-on-click-modal="false">
			<div v-loading="gwCfgLoading">
				<el-alert type="info" :closable="false" show-icon class="m-b-15"
					:title="`以下是引用了服务 ${gwCfgService} 的 AI 网关。域名与模型路由可在此调整；改完按「保存」整体提交。`" />
				<el-empty v-if="!gwCfgList.length && !gwCfgLoading" description="该服务尚未被任何 AI 网关引用" />
				<div v-for="gw in gwCfgList" :key="gw.name" class="gw-cfg-card">
					<div class="gw-cfg-head">
						<span class="gw-cfg-name">{{ gw.name }}</span>
						<el-tag size="small" type="info">{{ gw.provider === 'higress' ? 'Higress' : gw.provider === 'litellm' ? 'LiteLLM' : gw.provider }}</el-tag>
					</div>
					<el-form label-width="90px" class="m-t-10">
						<el-form-item v-if="gw.provider === 'higress'" label="访问域名">
							<el-input v-model="gw.domainEdit" placeholder="可选，如 gw.example.com（不含 http:// 与路径）" />
						</el-form-item>
					</el-form>
					<el-table :data="gw.routes" size="small" border>
						<el-table-column prop="name" label="对外模型名" min-width="140" />
						<el-table-column prop="service" label="后端服务" min-width="140">
							<template #default="{ row: r }">
								{{ r.service }}
								<el-tag v-if="r.service === gwCfgService" size="small" type="success" class="m-l-5">本服务</el-tag>
							</template>
						</el-table-column>
						<el-table-column label="操作" width="90">
							<template #default="{ row: r }">
								<el-button v-if="r.service === gwCfgService" link type="danger" size="small" @click="removeGwRoute(gw, r)">删除</el-button>
								<span v-else class="na-val">—</span>
							</template>
						</el-table-column>
					</el-table>
					<div class="gw-cfg-add">
						<el-input v-model="gw.newModel" size="small" placeholder="新增本服务的对外模型名" @keyup.enter="addGwRoute(gw)" />
						<el-button size="small" @click="addGwRoute(gw)">添加路由</el-button>
						<el-button size="small" type="primary" :loading="gw.saving" @click="saveGwCfg(gw)">保存</el-button>
					</div>
				</div>
			</div>
		</el-drawer>

		<!-- 新建 / 更新推理服务：同一套抽屉（create · edit 共用，字段契约见 docs/新建推理服务-创建参数定义.md） -->
		<el-drawer
			v-model="createVisible"
			:title="drawerTitle"
			direction="rtl"
			size="600px"
			:modal="false"
			:close-on-click-modal="false"
			:destroy-on-close="true"
			append-to-body
		>
			<el-alert v-if="!serverName" type="error" :closable="false" show-icon class="m-b-15"
				title="当前服务节点未设置 server_name，无法创建推理服务" description="请在服务树上为该叶子节点补填服务名（server_name）" />
			<el-alert v-if="isEdit" type="info" :closable="false" show-icon class="m-b-15"
				title="更新模式：可按落库的 spec 回显后修改" description="模型/版本、对外模型名、节点池为创建期契约，更新不支持变更（后端 Update 未开放这些字段），已置只读" />
			<el-form ref="createFormRef" v-loading="editLoading" :model="form" :rules="rules" label-position="top" class="create-form" :disabled="!serverName">
				<!-- 基础信息 -->
				<div class="form-section">
					<div class="form-section__title">基础信息</div>
					<el-form-item label="服务名">
						<el-input :model-value="serverName || '—'" disabled />
						<div class="form-tip">直接取自服务树节点的 server_name（全环境唯一），不再单独填写</div>
					</el-form-item>
					<el-form-item label="所属服务节点">
						<el-input :model-value="nodePathText" disabled />
					</el-form-item>
					<el-form-item label="命名空间">
						<el-input :model-value="namespaceText" disabled />
						<div class="form-tip">由当前环境自动映射，避免与 env 隔离语义冲突</div>
					</el-form-item>
				</div>

				<!-- 模型引用 -->
				<div class="form-section">
					<div class="form-section__title">模型（引用注册表，来源在「模型注册」维护）</div>
					<el-form-item label="模型" prop="model">
						<el-select v-model="form.model" filterable placeholder="选择模型" style="width: 100%" :loading="modelLoading" :disabled="isEdit" @change="onModelChange">
							<el-option v-for="m in modelOptions" :key="m.name" :label="m.name" :value="m.name">
								<span>{{ m.name }}</span>
								<span class="option-meta">{{ m.size_gb }}GB</span>
							</el-option>
						</el-select>
						<div v-if="isEdit" class="form-tip">更新不换权重：切换模型/版本等价于换一套模型，请另建服务</div>
					</el-form-item>
					<el-form-item label="版本（production）" prop="model_version">
						<el-select v-model="form.model_version" placeholder="production 版本" style="width: 100%" :loading="versionLoading" :disabled="isEdit">
							<el-option v-for="v in productionVersions" :key="v.version" :label="v.version" :value="v.version" />
						</el-select>
						<div v-if="isEdit && form.model_version" class="form-tip">当前绑定版本：{{ form.model_version }}（创建时 Pin 的版本主键固定，更新不支持切换）</div>
						<div v-if="selectedVersion" class="model-meta">
							<el-tag size="small" type="success">production</el-tag>
							<span class="model-meta__path">{{ selectedVersion.version }} · {{ selectedVersion.size_gb }}GB</span>
						</div>
						<div v-else-if="form.model" class="form-tip">该模型暂无 production 版本，请先在模型模块 promote</div>
					</el-form-item>
					<el-form-item label="对外模型名（served_model_name）">
						<el-input v-model="form.served_model_name" :disabled="isEdit" placeholder="默认与模型名一致（小写）" />
						<div class="form-tip">Playground 与网关调用时使用的 model 参数</div>
						<div v-if="isEdit" class="form-tip">更新暂不支持改对外模型名（后端 Update 未开放 served_model_name），如需变更请重建服务</div>
					</el-form-item>

					<!-- 权重挂载：存储元信息来自模型注册（只读）；卷来源二选一，挂载根口径见渲染契约 §7.1 -->
					<el-form-item label="权重挂载">
						<div class="mount-box">
							<div v-if="mountMetaRows.length" class="mount-meta">
								<div v-for="r in mountMetaRows" :key="r.label" class="mount-meta__row">
									<span class="mount-meta__label">{{ r.label }}</span>
									<span class="mount-meta__path">{{ r.value }}</span>
								</div>
							</div>
							<div v-else-if="form.model" class="compat-line compat-line--warn">
								⚠ 该模型未登记 NAS 缓存/本地路径：请确认目标卷中已有版本目录，否则 Pod 会因找不到权重启动失败
							</div>
							<el-radio-group v-model="form.mount_source">
								<el-radio-button label="pvc">PVC（生产推荐）</el-radio-button>
								<el-radio-button label="hostpath">hostPath（dev/单机）</el-radio-button>
							</el-radio-group>
						</div>
					</el-form-item>
					<el-form-item v-if="form.mount_source === 'pvc'" label="PVC 名称" prop="model_cache_pvc">
						<div style="display: flex; gap: 8px; width: 100%">
							<el-select
								v-model="form.model_cache_pvc"
								placeholder="留空不挂载"
								style="flex: 1"
								clearable
								filterable
								:loading="pvcLoading"
								@visible-change="(v: boolean) => v && loadPVCs()"
							>
								<el-option v-for="p in visiblePvcOptions" :key="p.namespace + '/' + p.name" :label="pvcOptionLabel(p)" :value="p.name" />
							</el-select>
							<el-button v-if="userInfo.isAdmin" @click="openPvcCreate()">新建</el-button>
						</div>
						<div v-if="pvcWarn" class="compat-line compat-line--warn">{{ pvcWarn }}</div>
						<div v-else class="form-tip">{{ pvcTip }}</div>
						<div v-if="warmupHint" class="compat-line" :class="warmupReady === 'ready' ? 'compat-line--ok' : 'compat-line--warn'">{{ warmupHint }}</div>
					</el-form-item>
					<el-form-item v-else label="宿主机路径" prop="model_host_path">
						<el-input v-model="form.model_host_path" :placeholder="hostPathPlaceholder" />
						<div class="form-tip">仅 dev/单机适用：Pod 会被绑死在持有该版本目录的节点上；留空按渲染器默认 {{ DEFAULT_MODEL_HOST_PATH }}</div>
						<div class="form-tip">挂载根必须<strong>包含</strong> {{ modelDirText }}/{{ versionDirText }} 两层（--model = /models/{{ modelDirText }}/{{ versionDirText }}），填到模型目录本身会导致权重路径找不到、Pod 起不来</div>
					</el-form-item>
					<el-form-item label="挂载预览">
						<div class="mount-preview">
							<span>卷（{{ mountSourceText }}）→ 容器 /models（只读）</span>
							<span>--model {{ modelPathPreview }}</span>
						</div>
						<div class="form-tip">挂载根跨发版不变，切版本只改 --model 路径（渲染契约 §7.1）</div>
					</el-form-item>
				</div>

				<!-- 推理引擎 -->
				<div class="form-section">
					<div class="form-section__title">推理引擎（引擎注册表驱动）</div>
					<el-form-item label="硬件平台" prop="hardware_platform">
						<el-select v-model="form.hardware_platform" style="width: 100%">
							<el-option v-for="p in platformOptions" :key="p.value" :label="p.label" :value="p.value" :disabled="p.disabled" />
						</el-select>
						<div class="form-tip">Ascend / Metax 平台待引擎镜像就绪后开放</div>
					</el-form-item>
					<el-form-item label="引擎与版本" prop="engine_id">
						<el-select v-model="form.engine_id" placeholder="选择引擎版本" style="width: 100%" @change="onEngineChange">
							<el-option v-for="e in engineOptions" :key="e.id" :label="e.display" :value="e.id" />
						</el-select>
						<div v-if="selectedEngine" class="model-meta">
							<span class="model-meta__path">镜像 {{ effectiveImage }}</span>
							<el-tag v-if="envImageOverride" size="small" type="warning" style="margin-left: 8px">
								{{ currentEnvLabel }}环境覆盖
							</el-tag>
						</div>
						<div v-if="imageDrift" class="compat-line compat-line--warn">{{ imageDrift }}</div>
					</el-form-item>
				</div>

				<!-- 引擎参数（按引擎差异化：schema 由引擎注册表下发） -->
				<div class="form-section">
					<div class="form-section__title">引擎参数（{{ selectedEngine?.engine }}）</div>
					<div class="param-grid">
						<el-form-item v-for="f in commonParamFields" :key="f.key" :label="f.label" :prop="`engine_params.${f.key}`">
							<el-select v-if="f.type === 'select'" v-model="form.engine_params[f.key]" :clearable="f.clearable" :placeholder="f.clearable ? '不启用' : '请选择'" style="width: 100%">
								<el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
							</el-select>
							<el-input-number v-else-if="f.type === 'number'" v-model="form.engine_params[f.key]" :min="f.min" :max="f.max" :step="f.step" style="width: 100%" />
							<el-switch v-else v-model="form.engine_params[f.key]" />
							<div v-if="f.tip" class="form-tip">{{ f.tip }}</div>
						</el-form-item>
					</div>

					<el-collapse class="adv-collapse">
						<el-collapse-item name="engine-adv">
							<template #title><span class="adv-title">高级参数</span></template>
							<el-form-item v-for="f in advancedParamFields" :key="f.key" :label="f.label">
								<el-select v-if="f.type === 'select'" v-model="form.engine_params[f.key]" style="width: 100%">
									<el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
								</el-select>
								<el-input v-else v-model="form.engine_params[f.key]" :placeholder="f.placeholder" />
								<div v-if="f.tip" class="form-tip">{{ f.tip }}</div>
							</el-form-item>
							<el-form-item label="原生参数（extra_args）" prop="extra_args_text">
								<el-input v-model="form.extra_args_text" type="textarea" :rows="3" placeholder="每行一个，如：--swap-space 4" />
								<div class="form-tip">被平台托管的参数（--model/--port/{{ selectedEngine?.engine === 'SGLang' ? '--mem-fraction-static' : '--gpu-memory-utilization' }} 等）禁止出现；与上方参数重复会被拦截</div>
							</el-form-item>
						</el-collapse-item>
					</el-collapse>
				</div>

				<!-- 算力 -->
				<div class="form-section">
					<div class="form-section__title">算力</div>
					<el-form-item label="节点池" prop="node_pool_id">
						<el-select
							v-model="form.node_pool_id"
							placeholder="选择节点池"
							style="width: 100%"
							:loading="poolLoading"
							:disabled="isEdit || !poolList.length"
						>
							<el-option
								v-for="p in poolList"
								:key="p.key"
								:label="poolOptionLabel(p)"
								:value="p.id"
								:disabled="p.source !== 'registered' || !p.id"
							>
								<span>{{ p.display_name || p.name }}</span>
								<span class="option-meta">{{ poolOptionMeta(p) }}</span>
							</el-option>
						</el-select>
						<div v-if="!poolLoading && !poolList.length" class="form-tip">
							当前环境还没有节点池。请先到「集群管理 → 节点池」创建：节点池 = 一组节点标签的命名约定，创建后符合条件的节点会自动成为成员。
						</div>
						<div v-if="isEdit" class="form-tip">更新不支持换节点池：池决定 nodeSelector 与容忍，改动等价于整体重新调度，本期未开放</div>
						<div v-if="compatText" class="compat-line" :class="compatClass">{{ compatText }}</div>
						<div v-if="selectedPool" class="affinity-preview">
							GPU 亲和性（平台自动生成）→ nodeSelector: {{ affinitySelectorText }}
							<template v-if="affinityTolerationText"> · toleration: {{ affinityTolerationText }}</template>
						</div>
						<div class="form-tip">
							选中节点池即完成 GPU 亲和性匹配：<b>nodeSelector 取自池的 selector，toleration 取自池的 tolerations</b>，无需手写；
							仅「已登记」的池可选（未登记的池是平台从节点标签反推出来的，没有权威的调度契约）。
						</div>
					</el-form-item>
					<el-form-item label="GPU / 副本" prop="gpu_per_replica">
						<el-select v-model="form.gpu_per_replica" style="width: 100%">
							<el-option v-for="n in [1, 2, 4, 8]" :key="n" :label="`${n} 卡`" :value="n" :disabled="gpuPerReplicaDisabled(n)" />
						</el-select>
						<div v-if="gpuCapBad" class="compat-line compat-line--bad">
							✗ 超出单节点卡数：该池单节点最多 {{ selectedPool?.agg.gpu_per_node_max }} 卡，GPU/副本 不能超过它（否则副本会一直 Pending）
						</div>
						<div v-else-if="selectedPool && !selectedPool.agg.gpu_per_node_max" class="compat-line compat-line--warn">
							⚠ 该池当前没有可用 GPU（单节点最大卡数为 0）：请确认成员节点已就绪且已暴露 GPU 资源
						</div>
						<div class="form-tip">单机场景下即张量并行度（TP）；上限受节点池「单节点最大卡数」约束</div>
					</el-form-item>
					<el-form-item label="GPU 共享">
						<el-select v-model="form.share_mode" style="width: 100%">
							<el-option label="整卡（不共享）" value="none" />
							<el-option label="HAMi 显存/算力切分（原生集群）" value="hami" />
							<el-option label="算力切分（time-slicing）" value="time-slicing" disabled />
							<el-option label="MIG 硬件隔离" value="mig" disabled />
						</el-select>
						<div class="form-tip">一期支持整卡与 HAMi（仅原生集群）；time-slicing / MIG 待后续开放</div>
					</el-form-item>
					<el-form-item v-if="form.share_mode === 'hami'" label="单卡显存 (GiB)" prop="card_memory_gi">
						<el-input-number v-model="form.card_memory_gi" :min="1" :max="512" style="width: 100%" placeholder="如 80（A100-80G）" />
						<div class="form-tip">HAMi 渲染需按卡型显存换算 volcano.sh/vgpu-memory（MiB）</div>
					</el-form-item>
				</div>

				<!-- 副本 -->
				<div class="form-section">
					<div class="form-section__title">副本</div>
					<el-form-item label="副本数" prop="replicas">
						<el-input-number v-model="form.replicas" :min="1" :max="200" />
						<div class="form-tip form-tip--inline">静态副本；弹性扩缩容默认关闭，启用后在服务详情的「弹性策略」中单独配置</div>
					</el-form-item>
				</div>

				<!-- 容器 -->
				<div class="form-section">
					<div class="form-section__title">容器</div>
					<div class="param-grid">
						<el-form-item label="CPU 请求" prop="cpu_request">
							<el-input v-model="form.cpu_request" placeholder="8" />
						</el-form-item>
						<el-form-item label="内存请求" prop="memory_request">
							<el-input v-model="form.memory_request" placeholder="32Gi" />
						</el-form-item>
						<el-form-item label="/dev/shm" prop="shm_size">
							<el-select v-model="form.shm_size" style="width: 100%">
								<el-option v-for="s in ['8Gi', '16Gi', '32Gi', '64Gi']" :key="s" :label="s" :value="s" />
							</el-select>
						</el-form-item>
					</div>
					<el-form-item label="镜像仓库凭证（imagePullSecrets）">
						<el-input v-model="form.image_pull_secret" placeholder="留空使用节点默认凭证" />
					</el-form-item>
					<el-form-item label="环境变量">
						<div class="kv-list">
							<div v-for="(kv, i) in form.envs" :key="`env-${i}`" class="kv-row">
								<el-input v-model="kv.name" placeholder="变量名" />
								<el-input v-model="kv.value" placeholder="值" />
								<el-button link type="danger" @click="form.envs.splice(i, 1)">删除</el-button>
							</div>
							<el-button link type="primary" @click="form.envs.push({ name: '', value: '' })">+ 添加环境变量</el-button>
						</div>
					</el-form-item>
					<el-form-item label="密钥引用（Secret）">
						<div class="kv-list">
							<div v-for="(kv, i) in form.env_secret_refs" :key="`sec-${i}`" class="kv-row kv-row--3">
								<el-input v-model="kv.name" placeholder="变量名" />
								<el-input v-model="kv.secret" placeholder="Secret 名" />
								<el-input v-model="kv.key" placeholder="Key" />
								<el-button link type="danger" @click="form.env_secret_refs.splice(i, 1)">删除</el-button>
							</div>
							<el-button link type="primary" @click="form.env_secret_refs.push({ name: '', secret: '', key: '' })">+ 添加密钥引用</el-button>
						</div>
						<div class="form-tip">如 HF_TOKEN、私有仓库凭证等敏感值，走 Secret 不落明文</div>
					</el-form-item>
				</div>

				<!-- 调度与生命周期 -->
				<div class="form-section">
					<div class="form-section__title">调度与生命周期</div>
					<el-form-item label="副本打散（podAntiAffinity）">
						<el-switch v-model="form.spread" />
						<div class="form-tip form-tip--inline">多副本尽量分布在不同节点</div>
					</el-form-item>
					<el-form-item label="拓扑感知打散（topologySpreadConstraints）">
						<el-select v-model="form.topology_key" clearable placeholder="不启用（默认）" style="width: 100%">
							<el-option label="节点级（kubernetes.io/hostname）" value="kubernetes.io/hostname" />
							<el-option label="可用区级（topology.kubernetes.io/zone）" value="topology.kubernetes.io/zone" />
						</el-select>
						<div class="form-tip">选填：集群节点没有对应拓扑标签时请留空，否则副本会因无法满足域分布而 Pending</div>
					</el-form-item>
					<div class="param-grid">
						<el-form-item label="探针端口">
							<el-input-number v-model="form.probe_port" :min="1" :max="65535" style="width: 100%" />
							<div class="form-tip form-tip--inline">默认取引擎注册表值</div>
						</el-form-item>
						<el-form-item label="启动超时（startupProbe 预算）">
							<el-input-number v-model="form.startup_timeout_minutes" :min="5" :max="60" style="width: 100%" />
						</el-form-item>
						<el-form-item label="终止宽限期（秒）">
							<el-input-number v-model="form.termination_grace_seconds" :min="30" :max="600" :step="30" style="width: 100%" />
						</el-form-item>
					</div>
					<div class="probe-row">
						<div class="probe-row__main">
							<el-switch v-model="form.probes.readiness.enabled" />
							<span class="probe-row__name">readiness（就绪）</span>
							<el-select v-model="form.probes.readiness.type" style="width: 120px" :disabled="!form.probes.readiness.enabled">
								<el-option label="HTTP 探活" value="http" />
								<el-option label="TCP 探活" value="tcp" />
							</el-select>
							<el-input v-if="form.probes.readiness.type === 'http'" v-model="form.probes.readiness.path" placeholder="/health" style="flex: 1" :disabled="!form.probes.readiness.enabled" />
						</div>
						<div v-if="form.probes.readiness.enabled" class="form-tip">http 检查 /health 接口（推荐，引擎就绪后返回 200）；tcp 只检查端口连通，进程僵死但端口仍监听时发现不了</div>
						<div v-else class="form-tip">已关闭：副本会被视为永远就绪，流量会直接打到未完成加载的实例上</div>
					</div>
					<div class="probe-row">
						<div class="probe-row__main">
							<el-switch v-model="form.probes.liveness.enabled" />
							<span class="probe-row__name">liveness（存活）</span>
							<el-select v-model="form.probes.liveness.type" style="width: 120px" :disabled="!form.probes.liveness.enabled">
								<el-option label="HTTP 探活" value="http" />
								<el-option label="TCP 探活" value="tcp" />
							</el-select>
							<el-input v-if="form.probes.liveness.type === 'http'" v-model="form.probes.liveness.path" placeholder="/health" style="flex: 1" :disabled="!form.probes.liveness.enabled" />
						</div>
						<div v-if="form.probes.liveness.enabled" class="form-tip">失败触发容器重启；失败阈值由引擎注册表模板下发</div>
						<div v-else class="form-tip">已关闭：引擎僵死（如 NCCL hang、进程 deadlock）时不再自动重启，需人工介入</div>
					</div>
					<div class="form-tip">startupProbe 始终开启兜模型加载期（不给关闭）；探针共用上方端口，就绪判据 = 权重加载 + KV 分配 + CUDA Graph 捕获完成</div>

					<el-form-item label="模型预热（lifecycle.postStart）">
						<el-switch v-model="form.warmup_enable" />
						<div class="form-tip form-tip--inline">在 Ready 前通过 postStart 预热，避免「已 Ready 但首次请求极慢」</div>
					</el-form-item>
					<el-form-item v-if="form.warmup_enable" label="预热命令（postStart exec）" prop="warmup_command">
						<el-input
							v-model="form.warmup_command"
							type="textarea"
							:rows="4"
							placeholder="示例：&#10;sh -c 'until curl -sf http://localhost:8000/health >/dev/null; do sleep 5; done; curl -s http://localhost:8000/v1/chat/completions -H &quot;Content-Type: application/json&quot; -d &quot;{\&quot;model\&quot;:\&quot;qwen-7b\&quot;,\&quot;messages\&quot;:[{\&quot;role\&quot;:\&quot;user\&quot;,\&quot;content\&quot;:\&quot;hi\&quot;}],\&quot;max_tokens\&quot;:1}&quot;'"
						/>
						<div class="form-tip">原样写入 lifecycle.postStart.exec.command；示例为「等 /health 通过后发一次 max_tokens=1 的真实请求触发 CUDA Graph 捕获」，端口按引擎实际端口填写</div>
					</el-form-item>
				</div>
			</el-form>
			<template #footer>
				<div class="drawer-footer">
					<div v-if="isEdit" class="drawer-footer__apply">
						<el-checkbox v-model="applyAfterSave">保存后同时下发到集群</el-checkbox>
						<div class="form-tip">勾选：Deployment 滚动更新（maxUnavailable=0，服务不中断）；取消：只更新平台配置，需回详情页手动下发才生效</div>
					</div>
					<div class="drawer-footer__actions">
						<el-button @click="createVisible = false">取消</el-button>
						<el-button type="primary" :loading="submitting" :disabled="!serverName || !compatOk || editLoading" @click="isEdit ? submitEdit() : submitCreate()">
							{{ isEdit ? '保存' : '创建' }}
						</el-button>
					</div>
				</div>
			</template>
		</el-drawer>

		<!-- 扩缩容 -->
		<el-dialog v-model="scaleVisible" title="扩缩容" width="420px">
			<el-form label-width="90px">
				<el-form-item label="服务名">
					<span>{{ scaleTarget.name }}</span>
				</el-form-item>
				<el-form-item label="副本数">
					<el-input-number v-model="scaleTarget.replicas" :min="0" :max="scaleTarget.max_replicas || 200" />
				</el-form-item>
				<el-form-item label="下发">
					<el-checkbox v-model="scaleTarget.apply">立即下发到集群（不勾选仅保存配置，集群侧不变）</el-checkbox>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="scaleVisible = false">取消</el-button>
				<el-button type="primary" :loading="submitting" @click="submitScale">应用</el-button>
			</template>
		</el-dialog>
		<!-- PVC 就地新建：与服务侧选择器同 ns、同一权威 API；创建成功自动选中。
		     注意：必须放在根 div 内保持单根 —— 本页由 <transition mode="out-in"> 包裹，
		     多根 fragment 会让离开过渡的 afterLeave 永不触发，路由切换整体卡死（白屏） -->
		<PvcCreateDialog
			v-model="pvcCreateVisible"
			:namespace="pvcNamespace"
			:default-name="pvcDefaultName"
			lock-namespace
			@created="onPvcCreated"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import * as api from '/@/api/inference';
import { getModelList, getModelDetail, getWarmups, type ModelVersion, type WarmupItem } from '/@/api/model';
import { getNodePools, getClusterPVCs, type ClusterPoolItem, type ClusterPVCItem } from '/@/api/cluster';
import { useUserInfo } from '/@/stores/userInfo';
import PvcCreateDialog from '/@/components/PvcCreateDialog.vue';
import { useEnvStore } from '/@/stores/env';
import { useEngineRegistryStore } from '/@/stores/engineRegistry';
import { useServiceTreeStore } from '/@/stores/serviceTree';
import { withContextQuery } from '/@/utils/routeContext';
import type { EngineImage, ParamField } from '/@/api/engine';
import {
	getGatewayList,
	getGatewayDetail,
	getProvidersAvailable,
	createGateway,
	updateGateway,
	listGatewaysForService,
	parseGatewaySpec,
	type GatewaySpec,
	type GatewayProvider,
	type ProviderInfo,
} from '/@/api/gateway';

// ── 网关接入（服务视角）────────────────────────────────────────────
// "每服务都能被代理"由网关里的模型路由承载；环境没有可用 AI 网关时就地创建并接入，
// 一条闭环路径（不再把用户踢到网关管理页）。有可用网关时允许自选目标（环境内可能有多条）。
const gwOnboardVisible = ref(false);
const gwOnboardSubmitting = ref(false);
const gwLoading = ref(false);
const gwOnboard = reactive({ service: '', model: '', serviceTreeId: 0 });
// attach：挂到已有网关；create：就地创建网关并接入
const gwMode = ref<'attach' | 'create'>('attach');
// 仅 provider 非空的网关才可挂路由（旧记录无驱动，下发链路无法处理）
const gwCandidates = ref<{ name: string; provider?: string }[]>([]);
const gwTarget = ref('');
const gwAvailable = ref<ProviderInfo[]>([]);
const gwNew = reactive({ name: '', provider: 'higress' as GatewayProvider, domain: '' });

const openGwOnboard = async (row: any) => {
	gwOnboard.service = row.name;
	gwOnboard.model = row.served_model_name || row.name;
	gwOnboard.serviceTreeId = row.service_tree_id || 0;
	gwOnboardVisible.value = true;
	gwLoading.value = true;
	try {
		const [lr, pa]: any[] = await Promise.all([
			getGatewayList({ type: 'ai', page: 1, size: 50 }),
			getProvidersAvailable(envStore.envId || undefined),
		]);
		gwCandidates.value = (lr.list || []).filter((g: any) => g.provider);
		gwAvailable.value = pa.providers || [];
		if (gwCandidates.value.length) {
			gwMode.value = 'attach';
			gwTarget.value = gwCandidates.value[0].name;
		} else {
			gwMode.value = 'create';
			gwNew.name = `gw-${row.name}`;
			gwNew.provider = (gwAvailable.value.find((p) => p.available)?.name as GatewayProvider) || 'higress';
			gwNew.domain = '';
		}
	} finally {
		gwLoading.value = false;
	}
};

const submitGwOnboard = async () => {
	const model = (gwOnboard.model || '').trim();
	if (!model) {
		ElMessage.warning('请填写对外模型名');
		return;
	}
	if (gwMode.value === 'create') {
		const name = (gwNew.name || '').trim();
		if (!name) {
			ElMessage.warning('请填写网关名称');
			return;
		}
		gwOnboardSubmitting.value = true;
		try {
			// spec 预置本服务的模型路由（spec 是网关配置的唯一权威源）；namespace 留空由后端按环境兜底
			const spec: GatewaySpec = { common: { namespace: '' } };
			if (gwNew.provider === 'higress') {
				spec.higress = { model_routes: [{ name: model, service: gwOnboard.service }] };
				if (gwNew.domain.trim()) spec.higress.domain = gwNew.domain.trim();
			} else {
				spec.litellm = { dispatch_mode: 'api', model_list: [{ name: model, service: gwOnboard.service }] };
			}
			spec.common.linked_services = [gwOnboard.service];
			await createGateway({
				type: 'ai',
				name,
				provider: gwNew.provider,
				service_tree_id: gwOnboard.serviceTreeId || undefined,
				spec,
			});
			ElMessage.success(`已创建网关 ${name} 并接入：${model} → ${gwOnboard.service}`);
			gwOnboardVisible.value = false;
			loadList();
		} finally {
			gwOnboardSubmitting.value = false;
		}
		return;
	}
	// attach 模式：目标网关由用户显式选择（环境内可能有多条 AI 网关，不允许再隐式取 list[0]）
	const gw = gwCandidates.value.find((g) => g.name === gwTarget.value);
	if (!gw) {
		ElMessage.warning('请选择目标网关');
		return;
	}
	gwOnboardSubmitting.value = true;
	try {
		const detail: any = await getGatewayDetail(gw.name);
		const spec: GatewaySpec = parseGatewaySpec(detail?.spec) || { common: { namespace: detail?.namespace || '' } };
		spec.common = spec.common || {};
		if (spec.higress) {
			spec.higress.model_routes = spec.higress.model_routes || [];
			if (spec.higress.model_routes.some((r) => r.name === model)) {
				ElMessage.warning(`对外模型名 ${model} 在该网关已存在`);
				return;
			}
			spec.higress.model_routes.push({ name: model, service: gwOnboard.service });
		} else if (spec.litellm) {
			spec.litellm.model_list = spec.litellm.model_list || [];
			if (spec.litellm.model_list.some((m) => m.name === model)) {
				ElMessage.warning(`对外模型名 ${model} 在该网关已存在`);
				return;
			}
			spec.litellm.model_list.push({ name: model, service: gwOnboard.service });
		} else {
			ElMessage.warning('无法识别网关配置段（higress / litellm 均为空），请到网关管理页检查');
			return;
		}
		spec.common.linked_services = Array.from(
			new Set([
				...(spec.higress?.model_routes || []).map((r) => r.service),
				...(spec.litellm?.model_list || []).map((m) => m.service),
			].filter(Boolean)),
		);
		await updateGateway(gw.name, { type: 'ai', name: gw.name, provider: gw.provider as GatewayProvider, spec });
		ElMessage.success(`已接入：${model} → ${gwOnboard.service}（挂到网关 ${gw.name}）`);
		gwOnboardVisible.value = false;
		loadList();
	} finally {
		gwOnboardSubmitting.value = false;
	}
};

// ── 网关配置（服务视角）────────────────────────────────────────────
// 反查引用了本服务的 AI 网关，域名/路由可在服务侧直接调整；编辑走网关整体 PUT
// （spec 是唯一权威源）。只允许删本服务的路由——其他服务的路由归网关管理页管。
const gwCfgVisible = ref(false);
const gwCfgLoading = ref(false);
const gwCfgService = ref('');
// 每条网关：spec（编辑底稿）、routes（higress/litellm 归一化视图）、domainEdit / newModel / saving（交互态）
const gwCfgList = ref<any[]>([]);

const specRoutes = (spec: GatewaySpec): { name: string; service: string }[] =>
	[...(spec.higress?.model_routes || []), ...(spec.litellm?.model_list || [])].map((r) => ({
		name: r.name,
		service: r.service,
	}));

const openGwConfig = async (row: any) => {
	gwCfgService.value = row.name;
	gwCfgVisible.value = true;
	gwCfgLoading.value = true;
	gwCfgList.value = [];
	try {
		const lr: any = await listGatewaysForService(row.name);
		const gws = (lr.list || []) as any[];
		gwCfgList.value = await Promise.all(
			gws.map(async (g) => {
				let spec: GatewaySpec = { common: { namespace: '' } };
				try {
					const d: any = await getGatewayDetail(g.name);
					spec = parseGatewaySpec(d?.spec) || spec;
				} catch {
					/* 详情拉不到时路由视图仍可用，保存会失败并给出后端提示 */
				}
				return {
					name: g.name,
					provider: g.provider,
					domainEdit: g.domain || '',
					spec,
					routes: specRoutes(spec),
					newModel: '',
					saving: false,
				};
			}),
		);
	} finally {
		gwCfgLoading.value = false;
	}
};

const rebuildLinkedServices = (spec: GatewaySpec) => {
	spec.common = spec.common || {};
	spec.common.linked_services = Array.from(new Set(specRoutes(spec).map((r) => r.service).filter(Boolean)));
};

const addGwRoute = (gw: any) => {
	const model = (gw.newModel || '').trim();
	if (!model) {
		ElMessage.warning('请填写对外模型名');
		return;
	}
	if (specRoutes(gw.spec).some((r) => r.name === model)) {
		ElMessage.warning(`对外模型名 ${model} 在该网关已存在`);
		return;
	}
	if (gw.spec.higress) {
		gw.spec.higress.model_routes = [...(gw.spec.higress.model_routes || []), { name: model, service: gwCfgService.value }];
	} else if (gw.spec.litellm) {
		gw.spec.litellm.model_list = [...(gw.spec.litellm.model_list || []), { name: model, service: gwCfgService.value }];
	} else {
		ElMessage.warning('无法识别网关配置段（higress / litellm 均为空），请到网关管理页检查');
		return;
	}
	gw.routes = specRoutes(gw.spec);
	gw.newModel = '';
};

const removeGwRoute = (gw: any, route: any) => {
	if (gw.spec.higress) {
		gw.spec.higress.model_routes = (gw.spec.higress.model_routes || []).filter((r: any) => r.name !== route.name);
	} else if (gw.spec.litellm) {
		gw.spec.litellm.model_list = (gw.spec.litellm.model_list || []).filter((m: any) => m.name !== route.name);
	}
	gw.routes = specRoutes(gw.spec);
};

const saveGwCfg = async (gw: any) => {
	const spec: GatewaySpec = gw.spec;
	if (gw.provider === 'higress' && spec.higress) {
		spec.higress.domain = (gw.domainEdit || '').trim();
	}
	rebuildLinkedServices(spec);
	gw.saving = true;
	try {
		await updateGateway(gw.name, { type: 'ai', name: gw.name, provider: gw.provider, spec });
		ElMessage.success(`网关 ${gw.name} 配置已保存`);
		await openGwConfig({ name: gwCfgService.value });
		loadList();
	} finally {
		gw.saving = false;
	}
};

const router = useRouter();
const route = useRoute();
const treeStore = useServiceTreeStore();
const envStore = useEnvStore();
const keyword = ref('');
const loading = ref(false);
const paginator = reactive({ total: 0, list: [] as any[], page: 1, size: 20, total_page: 0 });

const statusTagType = (s: string) =>
	({ Creating: 'info', Running: 'success', Updating: 'warning', Scaling: 'warning', Error: 'danger', Stopped: 'info' } as Record<string, string>)[s] || 'info';

const loadList = async () => {
	if (!treeStore.hasSelected) {
		paginator.list = [];
		paginator.total = 0;
		return;
	}
	loading.value = true;
	try {
		const r = await api.getInferenceList({
			keyword: keyword.value,
			page: paginator.page,
			size: paginator.size,
			service_id: treeStore.serviceId,
		});
		Object.assign(paginator, r);
	} finally {
		loading.value = false;
	}
};
watch(() => treeStore.serviceId, () => {
	paginator.page = 1;
	loadList();
});

const goDetail = (row: any) => router.push({ path: `/inference/detail/${encodeURIComponent(row.name)}`, query: withContextQuery(route.query) });

// ───────────────────────── 引擎镜像注册表（后端 engine_image，经 stores/engineRegistry 缓存） ─────────────────────────
// 权威源在后端注册表：镜像坐标、CUDA 要求、默认端口、参数 schema 与默认值都由 GET /api/engine/images 下发。
// 页面只做"打开抽屉前 ensureLoaded → 同步 computed 取数"，不再内置任何引擎常量。
const engineStore = useEngineRegistryStore();
const PLATFORM_LABEL: Record<string, string> = {
	'linux/amd64/nvidia': 'linux/amd64/nvidia',
	'linux/amd64/ascend': 'linux/amd64/ascend',
	'linux/amd64/metax': 'linux/amd64/metax',
	'linux/arm64/metax': 'linux/arm64/metax',
};
// 平台选项改为按注册表实际登记的平台生成（此前是硬编码 4 项 + disabled 占位：
// 新登记平台后表单选不到，下线某平台后仍可选）。无可选镜像行的平台置灰。
const platformOptions = computed(() => {
	const registered = engineStore.platforms;
	const list = registered.length ? registered : ['linux/amd64/nvidia'];
	return list.map((p) => ({ label: PLATFORM_LABEL[p] || p, value: p, disabled: !engineStore.optionsFor(p).length }));
});
const engineOptions = computed(() => engineStore.optionsFor(form.hardware_platform));
const selectedEngine = computed<EngineImage | null>(() => engineStore.byId(form.engine_id));
const activeSchema = computed<ParamField[]>(() => engineStore.schemaOf(selectedEngine.value));
const commonParamFields = computed(() => activeSchema.value.filter((f) => !f.advanced));
const advancedParamFields = computed(() => activeSchema.value.filter((f) => f.advanced));

// ───────────────────────── 节点池（真实数据：GET /cluster/nodepools） ─────────────────────────
// 语义要点（见 docs/节点池设计-创建与消费.md §4.1）：
//   推理侧只存「池引用」，由平台把池的 selector/tolerations 编译成 nodeSelector + toleration 下发；
//   不存展开后的结果，池的标签演进时存量业务跟着池走，避免"池改了、Deployment 还是旧的"两边分叉。
//   因此这里只允许选「已登记」的池：observed 池是平台从节点标签反推的，没有权威调度契约。
const poolList = ref<ClusterPoolItem[]>([]);
const poolLoading = ref(false);
const loadPools = async () => {
	if (!envStore.hasSelected) {
		poolList.value = [];
		return;
	}
	poolLoading.value = true;
	try {
		const res: any = await getNodePools();
		poolList.value = res?.list ?? [];
	} catch {
		poolList.value = [];
	} finally {
		poolLoading.value = false;
	}
};
// 可选池：已登记 + 有 DB 主键（未登记池 id=0，无法落库引用）
const selectablePools = computed(() => poolList.value.filter((p) => p.source === 'registered' && p.id > 0));
const selectedPool = computed<ClusterPoolItem | null>(() => poolList.value.find((p) => p.id === form.node_pool_id) || null);

const parseJSONMap = (s: string): Record<string, string> => {
	try {
		const v = JSON.parse(s || '{}');
		return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
};
const parseJSONArr = (s: string): any[] => {
	try {
		const v = JSON.parse(s || '[]');
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
};
const gpuProductShort = (p: string) => (p || '').replace(/^nvidia\.com\//, '').replace(/^NVIDIA-?/i, '');
const poolGpuText = (p: ClusterPoolItem) =>
	p.agg.gpu_total > 0 ? `${gpuProductShort(p.agg.gpu_products[0] || 'GPU')} ×${p.agg.gpu_total}` : '无 GPU';
const poolOptionLabel = (p: ClusterPoolItem) => `${p.display_name || p.name}（${poolGpuText(p)}）`;
const poolOptionMeta = (p: ClusterPoolItem) => (p.source === 'registered' ? `${p.agg.node_count} 节点` : '未登记');

// 亲和性预览：nodeSelector 来自 selector，toleration 来自 tolerations（与后端编译口径一致）
const affinitySelectorText = computed(() => {
	if (!selectedPool.value) return '';
	const pairs = Object.entries(parseJSONMap(selectedPool.value.selector)).map(([k, v]) => `${k}=${v || '""'}`);
	return pairs.length ? pairs.join(' · ') : `池归属标签（${selectedPool.value.key}）`;
});
const affinityTolerationText = computed(() => {
	if (!selectedPool.value) return '';
	const text = parseJSONArr(selectedPool.value.tolerations)
		.map((t: any) => (typeof t === 'string' ? t : [t?.key, t?.effect].filter(Boolean).join(':')))
		.filter(Boolean);
	return text.join(' · ');
});

// CUDA 兼容：三态。'' 驱动版本 = 未采集 → unknown（提醒 + 提交前二次确认，不静默放行也不硬阻断）
const cudaTuple = (s: string) => s.split('.').map((x) => parseInt(x, 10) || 0);
const compatLevel = computed<'ok' | 'bad' | 'unknown'>(() => {
	if (!selectedEngine.value || !selectedPool.value) return 'ok'; // 未选全时不拦截，由必填校验兜底
	const need = cudaTuple(selectedEngine.value.cuda_requirement);
	const have = cudaTuple(selectedPool.value.agg.driver_cuda);
	if (!selectedPool.value.agg.driver_cuda) return 'unknown';
	return have[0] > need[0] || (have[0] === need[0] && have[1] >= need[1]) ? 'ok' : 'bad';
});
const compatOk = computed(() => compatLevel.value !== 'bad');
const compatText = computed(() => {
	const eng = selectedEngine.value;
	const pool = selectedPool.value;
	if (!eng || !pool) return '';
	const poolName = pool.display_name || pool.name;
	if (compatLevel.value === 'unknown') return `⚠ 兼容性待确认：节点池「${poolName}」的驱动版本未采集（成员节点 label 无驱动信息），无法校验镜像所需 CUDA ${eng.cuda_requirement}`;
	if (compatLevel.value === 'ok') return `✓ 兼容：镜像 CUDA ${eng.cuda_requirement} / 节点池驱动 ${pool.agg.driver_version || '-'}（支持 CUDA ${pool.agg.driver_cuda}）`;
	return `✗ 不兼容：镜像需要 CUDA ${eng.cuda_requirement}，节点池「${poolName}」驱动仅支持 CUDA ${pool.agg.driver_cuda}`;
});
const compatClass = computed(() => ({
	'compat-line--ok': compatLevel.value === 'ok',
	'compat-line--bad': compatLevel.value === 'bad',
	'compat-line--warn': compatLevel.value === 'unknown',
}));

// §4.3-② 准入校验：单副本 GPU 数 ≤ 池内单节点最大卡数，否则多卡 TP 会因凑不齐一张卡而永远 Pending
const gpuCapBad = computed(() => {
	const max = selectedPool.value?.agg.gpu_per_node_max || 0;
	return max > 0 && form.gpu_per_replica > max;
});
const gpuPerReplicaDisabled = (n: number) => {
	const max = selectedPool.value?.agg.gpu_per_node_max || 0;
	return max > 0 && n > max;
};

// ───────────────────────── 表单 ─────────────────────────
const createVisible = ref(false);
const submitting = ref(false);
const createFormRef = ref<FormInstance>();

// ── 抽屉三态：create（新建）/ edit（更新，复用同一套表单回显 spec）──
const drawerMode = ref<'create' | 'edit'>('create');
const isEdit = computed(() => drawerMode.value === 'edit');
const editLoading = ref(false);
const editDetail = ref<any>(null); // 更新前的服务详情：用于只读回显与镜像漂移判断
const applyAfterSave = ref(true); // 二次确认里由用户决定：保存后是否同时下发到集群（默认下发）
const drawerTitle = computed(() =>
	isEdit.value ? `更新推理服务 · ${editDetail.value?.name || serverName.value || ''}` : '新建推理服务'
);
// 当前环境：镜像地址是「注册表行 × 环境」的函数（dev/prod 各自的 registry），
// 展示与提交都必须用"本环境实际下发的地址"，口径与后端 resolveAndRender 一致。
const currentEnvId = computed(() => envStore.envId);
const currentEnvLabel = computed(() => envStore.currentEnv?.name || '');
const envImageOverride = computed(() => engineStore.envOverride(selectedEngine.value?.id, currentEnvId.value));
const effectiveImage = computed(() => engineStore.effectiveImage(selectedEngine.value, currentEnvId.value));

// 镜像漂移：落库镜像不在引擎注册表内时，保存会按所选引擎回退 —— 明确提示而非静默替换
const imageDrift = computed(() => {
	if (!isEdit.value) return '';
	const saved = String(editDetail.value?.spec?.image || '');
	const next = effectiveImage.value;
	if (!saved || !next || saved === next) return '';
	// 覆盖导致的差异不是漂移：那是管理员为本环境刻意指定的地址，单独给一句解释就行
	if (engineStore.envOverride(editDetail.value?.spec?.engine_id, currentEnvId.value)?.image === next) return '';
	return `⚠ 当前镜像 ${saved} 不在引擎注册表内：保存后会按所选引擎回退为 ${next}。要保留原镜像请先在引擎注册表登记该版本。`;
});

// 服务名直接取服务树叶子节点 server_name（全环境唯一）
const serverName = computed(() => (treeStore.currentNode?.node_type === 2 ? treeStore.currentNode?.server_name || '' : ''));
const namespaceText = computed(() => envStore.currentEnv?.namespace || '—');
const nodePathText = computed(() => treeStore.currentNode?.path || treeStore.currentNode?.name || '—');

const defaultForm = () => ({
	hardware_platform: 'linux/amd64/nvidia',
	// 默认引擎取注册表首个启用行（未加载完时为 0，必填校验会拦住提交）
	engine_id: engineStore.firstActive?.id || 0,
	engine_params: { ...((engineStore.firstActive?.default_params || {}) as any) },
	extra_args_text: '',
	node_pool_id: 1,
	gpu_per_replica: 1,
	share_mode: 'none',
	card_memory_gi: 0, // hami 模式必填：单卡显存 GiB（渲染换算 vgpu-memory MiB）
	replicas: 1,
	cpu_request: '8',
	memory_request: '32Gi',
	shm_size: '32Gi',
	model_cache_pvc: '',
	model_host_path: '',
	mount_source: 'pvc' as 'pvc' | 'hostpath',
	image_pull_secret: '',
	envs: [] as { name: string; value: string }[],
	env_secret_refs: [] as { name: string; secret: string; key: string }[],
	spread: true,
	topology_key: '',
	probe_port: 8000,
	probes: {
		readiness: { enabled: true, type: 'http', path: '/health' },
		liveness: { enabled: true, type: 'http', path: '/health' },
	},
	warmup_enable: true,
	warmup_command: '',
	startup_timeout_minutes: 20,
	termination_grace_seconds: 120,
	// 以下由上下文/联动填充
	model: '',
	model_version: '',
	served_model_name: '',
	namespace: '',
});
const form = reactive(defaultForm());

// extra_args 黑名单：平台托管基础参数 + 当前引擎 schema 中的全部 flag（按引擎差异化）
const EXTRA_ARGS_HOSTED_BASE = ['--host', '--port', '--model', '--served-model-name'];
const parseExtraArgs = (): { args: string[]; error: string } => {
	const lines = form.extra_args_text.split('\n').map((l) => l.trim()).filter(Boolean);
	const blacklist = [...EXTRA_ARGS_HOSTED_BASE, ...activeSchema.value.map((f) => f.flag)];
	for (const line of lines) {
		const flag = line.split(/[\s=]/)[0];
		if (blacklist.includes(flag)) return { args: [], error: `${flag} 由平台托管，不能在原生参数中出现` };
		// 与「引擎参数」表单字段的冲突检测（按引擎 flag → key 映射）
		const field = activeSchema.value.find((p) => p.flag === flag);
		if (field) {
			const v = form.engine_params[field.key];
			const filled = field.type === 'switch' ? v === true : v !== '' && v !== undefined && v !== null;
			if (filled) return { args: [], error: `${flag} 与「引擎参数」中的 ${field.label} 重复，请只保留一处` };
		}
	}
	return { args: lines, error: '' };
};

// 校验规则按当前引擎 schema 动态生成（如 batched tokens ≤ 上下文长度，两引擎字段名不同）
const rules = computed<FormRules>(() => {
	const base: FormRules = {
		engine_id: [{ required: true, message: '请选择引擎版本', trigger: 'change' }],
		node_pool_id: [{ required: true, message: '请选择节点池', trigger: 'change' }],
		gpu_per_replica: [{ required: true, message: '请设置 GPU/副本', trigger: 'change' }],
		replicas: [{ required: true, message: '请设置副本数', trigger: 'change' }],
	};
	// 模型/版本只在创建态必填：编辑态二者只读，且版本号不入库（inference_service 无 model_version 列，
	// 只能由 model_version_id 反查），沿用必填会在存量记录上形成「只读字段却必填为空」的死锁
	if (!isEdit.value) {
		base.model = [{ required: true, message: '请选择模型', trigger: 'change' }];
		base.model_version = [{ required: true, message: '请选择 production 版本', trigger: 'change' }];
	}
	// 权重挂载：按当前卷来源校验对应字段（另一侧不校验，避免切换来源后旧值仍红）
	base.model_cache_pvc = [
		{
			validator: (_r: unknown, _v: unknown, cb: (e?: Error) => void) => {
				if (form.mount_source !== 'pvc') return cb();
				const v = form.model_cache_pvc.trim();
				if (!v) return cb(); // 留空 = 不挂载权重盘（dev 渲染回退 hostPath）
				if (v.length > 253 || !PVC_NAME_RE.test(v)) return cb(new Error('PVC 名须为 DNS-1123 子域名：小写字母/数字/./-，以字母或数字开头结尾'));
				cb();
			},
			trigger: 'blur',
		},
	];
	base.model_host_path = [
		{
			validator: (_r: unknown, _v: unknown, cb: (e?: Error) => void) => {
				if (form.mount_source !== 'hostpath') return cb();
				const v = form.model_host_path.trim();
				if (v && !v.startsWith('/')) return cb(new Error('宿主机路径须为绝对路径（以 / 开头）'));
				cb();
			},
			trigger: 'blur',
		},
	];
	for (const f of activeSchema.value) {
		if (!f.cross_max) continue;
		base[`engine_params.${f.key}`] = [
			{
				validator: (_r: unknown, _v: unknown, cb: (e?: Error) => void) => {
					const target = activeSchema.value.find((p) => p.key === f.cross_max);
					cb(form.engine_params[f.key] > form.engine_params[f.cross_max!] ? new Error(`不能大于${target?.label || f.cross_max}`) : undefined);
				},
				trigger: 'change',
			},
		];
	}
	return base;
});

// 模型与版本联动：版本列表来自模型详情，只列 production
const modelLoading = ref(false);
const versionLoading = ref(false);
const modelOptions = ref<any[]>([]);
const versionOptions = ref<ModelVersion[]>([]);
const productionVersions = computed(() => versionOptions.value.filter((v) => v.status === 'production'));
const selectedVersion = computed(() => productionVersions.value.find((v) => v.version === form.model_version) || null);

// 权重挂载（渲染契约 §7.1）：存储元信息来自模型注册（只读）；卷来源二选一（PVC 生产 / hostPath dev）。
// 挂载根 = 包含 {模型目录}/ 的父目录；--model = /models/{模型目录}/{版本目录}（与后端 modelContainerPath 同口径）
const DEFAULT_MODEL_HOST_PATH = '/nas/models'; // 渲染器 hostPath 兜底默认值（render.go）
const PVC_NAME_RE = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/; // K8s DNS-1123 子域名
const modelMeta = ref<any>(null);
const pathBase = (p?: string) => String(p || '').replace(/\/+$/, '').split('/').pop() || '';
const modelDirText = computed(() => pathBase(modelMeta.value?.cache_nas) || pathBase(modelMeta.value?.local_path) || form.model || '模型名');
const versionDirText = computed(() => form.model_version || '版本');
const modelPathPreview = computed(() => `/models/${modelDirText.value}/${versionDirText.value}`);
// 存储元信息行：S3 取版本级路径（精确到版本），NAS/本地为模型级目录
const mountMetaRows = computed(() => {
	const m = modelMeta.value || {};
	const rows: { label: string; value: string }[] = [];
	const s3 = selectedVersion.value?.storage_path || m.storage_path;
	if (s3) rows.push({ label: 'S3 原件', value: s3 });
	if (m.cache_nas) rows.push({ label: 'NAS 缓存', value: m.cache_nas });
	if (m.local_path) rows.push({ label: '本地路径', value: m.local_path });
	return rows;
});
// hostPath 推导：登记路径向上剥离 {模型目录}/{版本目录} 两段后才是挂载根
//（登记口径可能是模型级目录，也可能带版本级；只取一层父目录会像 vllm-dev-1 那样
//  把「模型目录」当成根，容器里 /models 已是模型目录，--model 再多拼一层 → 找不到权重）
const stripTrailingSeg = (p: string, seg: string) => (seg && p.endsWith(`/${seg}`) ? p.slice(0, -(seg.length + 1)) : p);
const derivedHostPath = computed(() => {
	const p = String(modelMeta.value?.local_path || modelMeta.value?.cache_nas || '').replace(/\/+$/, '');
	if (!p) return '';
	const noVer = stripTrailingSeg(p, versionDirText.value === '版本' ? '' : versionDirText.value);
	return stripTrailingSeg(noVer, modelDirText.value === '模型名' ? '' : modelDirText.value);
});
const hostPathPlaceholder = computed(() => derivedHostPath.value || DEFAULT_MODEL_HOST_PATH);
const mountSourceText = computed(() => {
	if (form.mount_source === 'pvc') return form.model_cache_pvc ? `PVC ${form.model_cache_pvc}` : 'PVC（待填名称）';
	return `hostPath ${form.model_host_path || DEFAULT_MODEL_HOST_PATH}`;
});
// 创建态：按存储副本预置卷来源——仅本地副本 → hostPath；否则 PVC（生产推荐）
const applyMountDefaults = () => {
	const m = modelMeta.value || {};
	form.mount_source = m.local_path && !m.cache_nas ? 'hostpath' : 'pvc';
	form.model_host_path = derivedHostPath.value;
};
// 切换卷来源：清理另一侧校验红字（两侧互斥，不应同时报错）；切 hostPath 时默认取模型登记路径
watch(() => form.mount_source, (v) => {
	createFormRef.value?.clearValidate(['model_cache_pvc', 'model_host_path']);
	// hostPath 优先取模型登记的本地副本/NAS 根目录（模型详情登记的路径），避免手填错路径
	if (v === 'hostpath' && !form.model_host_path) form.model_host_path = derivedHostPath.value;
});
const loadModels = async () => {
	modelLoading.value = true;
	try {
		const r = await getModelList({ page: 1, size: 200, service_id: treeStore.serviceId });
		modelOptions.value = r?.list || [];
	} catch {
		modelOptions.value = [];
	} finally {
		modelLoading.value = false;
	}
};
const loadVersions = async (modelName: string) => {
	versionOptions.value = [];
	modelMeta.value = null;
	form.model_version = '';
	if (!modelName) return;
	versionLoading.value = true;
	try {
		const detail = (await getModelDetail(modelName)) as any;
		modelMeta.value = detail?.meta || null;
		versionOptions.value = detail?.versions || [];
		// production 版本自动选中（通常只有一个；多个时取最新，接口顺序即时间序）
		const prods = versionOptions.value.filter((v) => v.status === 'production');
		form.model_version = prods.length ? prods[prods.length - 1].version : '';
		// 创建态：按模型登记的存储副本预置挂载来源（仅本地副本 → hostPath）
		applyMountDefaults();
	} catch {
		versionOptions.value = [];
	} finally {
		versionLoading.value = false;
	}
};
const onModelChange = (name: string) => {
	form.model_version = '';
	form.served_model_name = (name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
	// 换模型：已选 PVC 可能与新模型无关（模型-卷绑定按模型过滤），清空待用户重新选择，避免挂错盘
	form.model_cache_pvc = '';
	loadVersions(name);
};

// 切引擎：按注册表下发该引擎的默认参数与默认端口（探针/预热随端口联动）
const onEngineChange = (id: number) => {
	const row = engineStore.byId(id);
	if (row) {
		form.engine_params = { ...(row.default_params as any) };
		form.probe_port = row.default_port;
	}
};

const openCreate = async (presetModel?: string) => {
	// 抽屉里 engineOptions / activeSchema 都是同步 computed，先把注册表加载到位再开
	await engineStore.ensureLoaded();
	drawerMode.value = 'create';
	editDetail.value = null;
	const first = engineOptions.value[0] || engineStore.firstActive;
	Object.assign(form, defaultForm(), {
		engine_id: first?.id || 0,
		engine_params: { ...((first?.default_params || {}) as any) },
		namespace: envStore.currentEnv?.namespace || '',
		model: presetModel || '',
	});
	if (presetModel) onModelChange(presetModel);
	createVisible.value = true;
	// 打开抽屉即拉真实节点池，并预选第一个可用（已登记）的池
	await loadPools();
	form.node_pool_id = selectablePools.value[0]?.id || 0;
	loadModels();
	loadPVCs(); // 形式按环境默认 namespace 收敛，与 form.namespace 一致
};

// ── 模型缓存卷（PVC）：按 (env, namespace) 收窄的可选列表 ──
// PVC 是 namespace 级对象（不能跨 ns 挂载），一级坐标就是本服务的 namespace：
// 创建时 = 环境默认 ns，编辑时 = 落库的 ns，两者都由 form.namespace 承载。
// 列表来自集群只读镜像（cluster_pvc），平台不提供 PVC 的创建/删除入口。
const pvcOptions = ref<ClusterPVCItem[]>([]);

// ── 预热就绪检查：所选 PVC × 当前版本是否存在成功灌数记录（S3→PVC 预热闭环的消费端）──
const warmupRecords = ref<WarmupItem[]>([]);
const warmupReady = computed<'' | 'ready' | 'running' | 'failed' | 'notready'>(() => {
	const pvc = form.model_cache_pvc?.trim();
	const ver = selectedVersion.value;
	if (form.mount_source !== 'pvc' || !pvc || !ver) return '';
	const recs = warmupRecords.value.filter((w) => w.version === ver.version && w.pvc_name === pvc);
	if (!recs.length) return 'notready';
	if (recs.some((w) => w.status === 'Success')) return 'ready';
	if (recs.some((w) => w.status === 'Running')) return 'running';
	return 'failed';
});
const warmupHint = computed(() => {
	switch (warmupReady.value) {
		case 'ready':
			return '该版本已预热到此卷（灌数完成），可直接挂载';
		case 'running':
			return '该版本的权重正在灌入此卷（预热进行中，完成后可挂载）';
		case 'failed':
			return '该版本到该卷的最近一次预热失败：请到模型仓库查看原因并重试';
		case 'notready':
			return '该版本尚未预热到此卷：卷内暂无权重目录，Pod 可能因找不到权重启动失败（可到模型仓库版本行「预热」）';
		default:
			return '';
	}
});
const loadWarmupStatus = async () => {
	const pvc = form.model_cache_pvc?.trim();
	if (form.mount_source !== 'pvc' || !pvc || !form.model) {
		warmupRecords.value = [];
		return;
	}
	try {
		const r: any = await getWarmups({ model: form.model, pvc_name: pvc });
		warmupRecords.value = r?.list ?? [];
	} catch {
		warmupRecords.value = [];
	}
};
watch([() => form.mount_source, () => form.model, () => form.model_version, () => form.model_cache_pvc], loadWarmupStatus);
const pvcLoading = ref(false);

const pvcNamespace = computed(() => form.namespace || envStore.currentEnv?.namespace || '');

// 编辑态原值：允许"原 PVC 已被集群侧删除"时仍能保存其他字段改动，不因陈旧引用卡死表单
const originalPVC = computed(() => String((editDetail.value as any)?.spec?.model_cache_pvc || ''));

const loadPVCs = async () => {
	if (!pvcNamespace.value) return;
	pvcLoading.value = true;
	try {
		const res: any = await getClusterPVCs({ namespace: pvcNamespace.value, size: 200 });
		pvcOptions.value = res?.list ?? [];
	} finally {
		pvcLoading.value = false;
	}
};

const selectedPVC = computed(() => pvcOptions.value.find((p) => p.name === form.model_cache_pvc) || null);

// 模型关联过滤：选定模型后，只列与该模型相关的存储卷（模型-存储卷绑定 / S3 预热记录，
// 后端 PVC 列表每行附带 bound_models）。「模型与存储卷对应」：没关联的盘不出现在下拉里。
// 编辑态原值卷始终保留（可能尚未建立绑定，避免陈旧引用把表单卡死）。
const visiblePvcOptions = computed<ClusterPVCItem[]>(() => {
	if (!form.model) return pvcOptions.value;
	const list = pvcOptions.value.filter((p) => (p.bound_models || []).some((m) => m.model_name === form.model));
	if (originalPVC.value && !list.some((p) => p.name === originalPVC.value)) {
		const orig = pvcOptions.value.find((p) => p.name === originalPVC.value);
		if (orig) list.push(orig);
	}
	return list;
});
const pvcAccessModes = (p: ClusterPVCItem) => (p.access_modes || '').split(',').filter(Boolean);

const fmtPvcSize = (bytes?: number) => {
	const n = Number(bytes || 0);
	if (!n) return '';
	const gi = n / 1024 ** 3;
	return gi >= 1024 ? `${(gi / 1024).toFixed(1)}Ti` : `${gi % 1 === 0 ? gi : gi.toFixed(1)}Gi`;
};

const pvcOptionLabel = (p: ClusterPVCItem) =>
	[p.name, fmtPvcSize(p.capacity_bytes || p.requested_bytes), pvcAccessModes(p).join('/'), p.phase].filter(Boolean).join(' · ');

// 存储卷风险提示：RWO 多副本只警告不阻断（单节点集群下同节点共享可正常工作）
const pvcWarn = computed(() => {
	const p = selectedPVC.value;
	if (!p) return '';
	if (p.phase && p.phase !== 'Bound') return `⚠ 该存储卷当前为 ${p.phase}：未绑定成功前 Pod 会一直 Pending，请先在集群侧确认。`;
	const modes = pvcAccessModes(p);
	if (form.replicas > 1 && !modes.includes('RWX')) {
		return `⚠ ${modes.join('/') || '未知访问模式'} 不支持跨节点共享：${form.replicas} 副本须全部落在同一节点，否则会卡 Pending。需要跨节点共享请让集群侧提供支持 RWX 的存储类。`;
	}
	return '';
});

const pvcTip = computed(() => {
	if (!pvcNamespace.value) return '权重盘与实例必须同命名空间，请先选择环境';
	if (!pvcOptions.value.length) return `命名空间 ${pvcNamespace.value} 下暂无存储卷：管理员可点右侧「新建」就地创建（与集群管理 → 存储卷同一入口）`;
	return `仅列出 ${pvcNamespace.value} 下的存储卷（PVC 不能跨命名空间挂载）；留空则不挂载权重盘，dev 环境会回退 hostPath`;
});

// ── PVC 就地新建：选择器里没有？管理员直接在此建（与集群页同一组件/同一 API） ──
const userInfo = useUserInfo();
const pvcCreateVisible = ref(false);
const pvcDefaultName = computed(() => (serverName.value ? `pvc-${serverName.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`.slice(0, 250) : ''));
const openPvcCreate = () => {
	if (!pvcNamespace.value) {
		ElMessage.warning('请先选择环境（权重盘与实例必须同命名空间）');
		return;
	}
	pvcCreateVisible.value = true;
};
const onPvcCreated = async (pvc: { namespace: string; name: string }) => {
	await loadPVCs();
	form.model_cache_pvc = pvc.name; // 就地创建后自动选中，闭环
};

// ── 提交前置校验（创建 / 更新共用）：返回错误文案，空串表示通过 ──
const preflight = (): string => {
	const extra = parseExtraArgs();
	if (extra.error) return extra.error;
	if (!compatOk.value) return '镜像 CUDA 与节点池驱动不兼容，请更换节点池或引擎版本';
	if (gpuCapBad.value) return `GPU/副本（${form.gpu_per_replica}）超过节点池单节点最大卡数（${selectedPool.value?.agg.gpu_per_node_max}），副本会一直 Pending`;
	if (form.share_mode === 'hami' && (!form.card_memory_gi || form.card_memory_gi <= 0)) return 'HAMi 共享模式需填写单卡显存（GiB），渲染时要换算 vgpu-memory';
	if (form.warmup_enable && !form.warmup_command.trim()) return '已开启模型预热，请填写预热命令（可参考输入框示例），或关闭该开关';
	// 存储卷：不允许提交本命名空间不可用的 PVC（仅拦"本次改动"，原值陈旧时放行，见 originalPVC）
	if (form.model_cache_pvc && form.model_cache_pvc !== originalPVC.value && !selectedPVC.value) {
		return `存储卷 ${form.model_cache_pvc} 不在命名空间 ${pvcNamespace.value} 的可用列表中（可能已被集群侧删除或尚未同步），请重新选择`;
	}
	for (const key of ['readiness', 'liveness'] as const) {
		const p = form.probes[key];
		if (p.enabled && p.type === 'http' && !p.path.trim()) return `已开启 ${key} 探针且类型为 HTTP，请填写探活路径（如 /health）`;
	}
	return '';
};

// ── spec 组装（创建 / 更新共用同一份契约，避免两条路径渲染口径分叉）──
const buildSpec = ():
	| { ok: true; spec: Record<string, unknown>; engineRow: EngineImage }
	| { ok: false; error: string } => {
	const extra = parseExtraArgs();
	if (extra.error) return { ok: false, error: extra.error };
	const engineRow = selectedEngine.value;
	if (!engineRow) return { ok: false, error: '请选择推理引擎版本' };
	// M3 渲染契约：spec 包装（后端 resolveAndRender 校验并渲染 Deployment/Service）
	const spec = {
		hardware_platform: form.hardware_platform,
		engine: engineRow.engine_key, // vllm | sglang（落库标识；后端还会按 engine_id 复核）
		engine_id: form.engine_id,
		// 兼容旧后端：仍带上注册表坐标（已应用本环境覆盖）；后端以注册表为权威源，不一致时只告警不采信
		image: effectiveImage.value,
		engine_params: form.engine_params,
		extra_args: extra.args,
		gpu_per_replica: form.gpu_per_replica,
		share_mode: form.share_mode,
		...(form.share_mode === 'hami' ? { card_memory_mib: Math.round(form.card_memory_gi * 1024) } : {}),
		cpu_request: form.cpu_request,
		memory_request: form.memory_request,
		shm_size: form.shm_size,
		// 卷来源二选一：PVC（生产）/ hostPath（dev），另一侧不下发（后端 spec 互斥校验兜底）
		model_cache_pvc: form.mount_source === 'pvc' ? form.model_cache_pvc.trim() : '',
		...(form.mount_source === 'hostpath' && form.model_host_path.trim() ? { model_host_path: form.model_host_path.trim() } : {}),
		image_pull_secret: form.image_pull_secret,
		envs: form.envs.filter((kv) => kv.name),
		env_secret_refs: form.env_secret_refs.filter((kv) => kv.name),
		scheduling: { spread: form.spread, topology_key: form.topology_key || '' },
		probes: {
			port: form.probe_port,
			startup_timeout_minutes: form.startup_timeout_minutes,
			readiness: {
				enabled: form.probes.readiness.enabled,
				type: form.probes.readiness.type,
				...(form.probes.readiness.type === 'http' ? { path: form.probes.readiness.path.trim() } : {}),
			},
			// 注意：liveness 必须取 liveness 自己的开关/类型/路径 —— 此前误用 readiness.*，
			// 导致「关掉存活探针」无效、存活路径跟随就绪路径（已修正）
			liveness: {
				enabled: form.probes.liveness.enabled,
				type: form.probes.liveness.type,
				...(form.probes.liveness.type === 'http' ? { path: form.probes.liveness.path.trim() } : {}),
			},
		},
		lifecycle: {
			termination_grace_seconds: form.termination_grace_seconds,
			post_start: form.warmup_enable && form.warmup_command.trim() ? { type: 'exec', command: form.warmup_command.trim() } : null,
		},
	};
	return { ok: true, spec, engineRow };
};

const submitCreate = async () => {
	if (!createFormRef.value) return;
	const preErr = preflight();
	if (preErr) {
		ElMessage.warning(preErr);
		return;
	}
	await createFormRef.value.validate(async (valid) => {
		if (!valid) return;
		// 驱动版本未采集 → CUDA 兼容性无法自动判定：不静默放行，要求人工确认后再提交
		if (compatLevel.value === 'unknown') {
			const eng = selectedEngine.value!;
			const poolNow = selectedPool.value!;
			const go = await ElMessageBox.confirm(
				`节点池「${poolNow.display_name || poolNow.name}」的驱动版本未采集，无法校验它是否满足镜像所需的 CUDA ${eng.cuda_requirement}。请自行确认该池成员节点的驱动版本 ≥ CUDA ${eng.cuda_requirement}，否则副本会因 CUDA 初始化失败反复 CrashLoopBackOff。`,
				'CUDA 兼容性未验证',
				{ type: 'warning', confirmButtonText: '已确认驱动版本，继续创建', cancelButtonText: '返回检查' }
			)
				.then(() => true)
				.catch(() => false);
			if (!go) return;
		}
		submitting.value = true;
		try {
			const built = buildSpec();
			if (!built.ok) {
				ElMessage.warning(built.error);
				return;
			}
			const { spec, engineRow } = built;
			const pool = selectedPool.value;
			// 结构化列（旧扁平字段保留兼容；spec 存在时后端走渲染链路）
			const contract = {
				name: serverName.value,
				service_tree_id: treeStore.serviceId,
				env_id: envStore.envId,
				namespace: form.namespace,
				model_id: 0, // 模型注册表主键，M1 落库后由接口返回
				model: form.model,
				model_version: form.model_version,
				// Pin 模式：显式绑定版本主键（后端校验其 production 状态）
				model_version_id: (selectedVersion.value as any)?.id || 0,
				served_model_name: form.served_model_name || form.model.toLowerCase(),
				node_pool_id: form.node_pool_id,
				replicas: form.replicas,
				spec,
			};
			// 现有后端兼容字段，保证旧字段口径不回退
			const legacy = {
				framework: engineRow.engine,
				min_replicas: form.replicas,
				max_replicas: form.replicas,
				gpu_per_replica: form.gpu_per_replica,
				gpu_type: pool?.agg.gpu_products?.[0] || '', // 卡型来自池内实际卡型，不再手填
			};
			await api.createInference({ ...contract, ...legacy });
			ElMessage.success('创建已提交');
			createVisible.value = false;
			loadList();
		} finally {
			submitting.value = false;
		}
	});
};

// ───────────────────────── 更新（编辑态）：同一套表单回填 spec，提交走 PUT ─────────────────────────

// 注册表默认参数（引擎切换 / 回填时打底）
const defaultParamsFor = (engineID?: number) => {
	const row = engineStore.byId(engineID) || engineStore.firstActive;
	return { ...((row?.default_params || {}) as any) };
};

// 编辑态加载版本仅供只读回显：不自动改选版本（「自动选最新 production」只属于创建态）
const loadVersionsForEdit = async (modelName: string) => {
	versionLoading.value = true;
	try {
		const detail: any = await getModelDetail(modelName);
		modelMeta.value = detail?.meta || null;
		versionOptions.value = detail?.versions || [];
		// 版本号不入库：用创建时 Pin 的版本主键反查出可读版本号（否则只读框为空）
		const boundID = Number(editDetail.value?.model_version_id || 0);
		if (!form.model_version && boundID > 0) {
			const hit = versionOptions.value.find((v: ModelVersion) => Number(v.id) === boundID);
			if (hit) form.model_version = hit.version;
		}
	} catch {
		versionOptions.value = [];
	} finally {
		versionLoading.value = false;
	}
};

// 用服务详情回填表单：spec 是唯一权威源（缺字段回退默认值，不把空值写进去）
const prefillFromDetail = (detail: any) => {
	const s = detail?.spec || {};
	const sp = s.scheduling || {};
	const pr = s.probes || {};
	const rd = pr.readiness || {};
	const lv = pr.liveness || {};
	const lc = s.lifecycle || {};
	const ps = lc.post_start || null;
	Object.assign(form, defaultForm(), {
		hardware_platform: s.hardware_platform || 'linux/amd64/nvidia',
		engine_id: s.engine_id || engineOptions.value[0]?.id || engineStore.firstActive?.id || 0,
		extra_args_text: (s.extra_args || []).join('\n'),
		node_pool_id: detail?.node_pool_id ?? 0,
		gpu_per_replica: s.gpu_per_replica ?? detail?.gpu_per_replica ?? 1,
		share_mode: s.share_mode || 'none',
		card_memory_gi: s.card_memory_mib ? Math.round(s.card_memory_mib / 1024) : 0,
		replicas: detail?.replicas ?? 1,
		cpu_request: s.cpu_request || '8',
		memory_request: s.memory_request || '32Gi',
		shm_size: s.shm_size || '32Gi',
		model_cache_pvc: s.model_cache_pvc || '',
		model_host_path: s.model_host_path || '',
		// 存量 spec 无卷字段时按渲染器行为回填 hostPath（默认 /nas/models），避免误判为「未挂载」
		mount_source: s.model_cache_pvc ? 'pvc' : 'hostpath',
		image_pull_secret: s.image_pull_secret || '',
		envs: (s.envs || []).map((e: any) => ({ name: e.name || '', value: e.value || '' })),
		env_secret_refs: (s.env_secret_refs || []).map((e: any) => ({ name: e.name || '', secret: e.secret || '', key: e.key || '' })),
		spread: sp.spread ?? true,
		topology_key: sp.topology_key || '',
		probe_port: pr.port || 8000,
		startup_timeout_minutes: pr.startup_timeout_minutes || 20,
		termination_grace_seconds: lc.termination_grace_seconds || 120,
		warmup_enable: !!ps,
		warmup_command: String(ps?.command || '').trim(),
		model: detail?.model || '',
		model_version: detail?.model_version || '',
		served_model_name: detail?.served_model_name || '',
		namespace: detail?.namespace || '',
	});
	form.probes = {
		readiness: { enabled: rd.enabled ?? true, type: rd.type || 'http', path: rd.path || '/health' },
		liveness: { enabled: lv.enabled ?? true, type: lv.type || 'http', path: lv.path || '/health' },
	};
	// 引擎参数：注册表默认打底 + 落库值覆盖（注册表后续新增字段也有默认值，不会渲染出空缺参数）
	form.engine_params = { ...defaultParamsFor(form.engine_id), ...(s.engine_params || {}) };
};

const openEdit = async (row: any) => {
	drawerMode.value = 'edit';
	editDetail.value = null;
	// 回填依赖注册表（engine_id → 镜像行/schema/默认参数），先加载到位
	await engineStore.ensureLoaded();
	Object.assign(form, defaultForm());
	createVisible.value = true;
	editLoading.value = true;
	applyAfterSave.value = true; // 默认同时下发（可取消 → 只改平台）
	try {
		await loadPools();
		loadModels();
		const detail: any = await api.getInferenceDetail(row.name);
		editDetail.value = detail;
		prefillFromDetail(detail);
		if (form.model) await loadVersionsForEdit(form.model);
		loadPVCs(); // 必须在 prefillFromDetail 之后：namespace 由落库值回填，选择器按该 ns 收敛
	} catch (e: any) {
		ElMessage.error(`读取服务配置失败：${e?.message || e}`);
		createVisible.value = false;
		drawerMode.value = 'create';
	} finally {
		editLoading.value = false;
	}
};

const submitEdit = async () => {
	if (!createFormRef.value || !editDetail.value) return;
	const preErr = preflight();
	if (preErr) {
		ElMessage.warning(preErr);
		return;
	}
	await createFormRef.value.validate(async (valid) => {
		if (!valid) return;
		const built = buildSpec();
		if (!built.ok) {
			ElMessage.warning(built.error);
			return;
		}
		const { spec, engineRow } = built;
		const pool = selectedPool.value;
		const name = editDetail.value.name;
		// 二次确认：明确告知本次改动对集群的影响（是否下发由抽屉里的勾选决定）
		const go = await ElMessageBox.confirm(
			applyAfterSave.value
				? `将保存对「${name}」的配置改动，并立即下发到集群：Deployment 滚动更新（maxUnavailable=0，服务不中断），Pod 会按新配置重建。`
				: `将只更新平台配置，集群侧保持现状（不做滚动更新）。改动需回服务详情页点「下发到集群」后才会生效。`,
			applyAfterSave.value ? '更新并下发' : '仅更新配置',
			{ type: applyAfterSave.value ? 'warning' : 'info', confirmButtonText: applyAfterSave.value ? '确认更新并下发' : '仅保存' }
		)
			.then(() => true)
			.catch(() => false);
		if (!go) return;
		submitting.value = true;
		try {
			// 可 patch 字段以后端 Update 为准：spec 走重渲染 + 同请求下发；
			// 模型/版本/对外模型名/节点池不在其中，界面已置只读，避免「改了没生效」的静默丢弃
			await api.updateInference(name, {
				replicas: form.replicas,
				min_replicas: form.replicas,
				max_replicas: form.replicas,
				gpu_per_replica: form.gpu_per_replica,
				gpu_type: pool?.agg.gpu_products?.[0] || '',
				framework: engineRow.engine,
				spec,
				apply: applyAfterSave.value,
			});
			ElMessage.success(applyAfterSave.value ? '已更新并下发到集群' : '配置已更新（未下发，集群未变）');
			createVisible.value = false;
			loadList();
		} finally {
			submitting.value = false;
		}
	});
};

// 由模型列表「部署」跳转（?model=xxx）时自动打开抽屉并预选模型
let presetHandled = false;
watch(
	() => [route.query.model, treeStore.hasSelected] as const,
	([preset, selected]) => {
		if (presetHandled || !selected || typeof preset !== 'string' || !preset) return;
		presetHandled = true;
		openCreate(preset);
	},
	{ immediate: true }
);

// 扩缩容
// 弹性策略状态解析：列表行的 spec 是 JSON 字符串（spec.autoscale.enabled）
const isAutoscale = (row: any) => {
	try {
		return !!row?.spec && typeof row.spec === 'string' && !!JSON.parse(row.spec)?.autoscale?.enabled;
	} catch {
		return false;
	}
};
const scaleVisible = ref(false);
const scaleTarget = reactive({ name: '', replicas: 0, max_replicas: 0, apply: true });
const openScale = (row: any) => {
	Object.assign(scaleTarget, { name: row.name, replicas: row.replicas, max_replicas: row.max_replicas, apply: true });
	scaleVisible.value = true;
};
const submitScale = async () => {
	submitting.value = true;
	try {
		await api.updateInference(scaleTarget.name, { replicas: scaleTarget.replicas, apply: scaleTarget.apply });
		ElMessage.success(scaleTarget.apply ? '扩缩容已下发集群' : '扩缩容已保存（未下发）');
		scaleVisible.value = false;
		loadList();
	} finally {
		submitting.value = false;
	}
};

const handleUpdate = (row: any) => openEdit(row);
const handleDelete = (row: any) => {
	ElMessageBox.confirm(`确认删除推理服务 ${row.name}？`, '提示', { type: 'warning' })
		.then(async () => {
			await api.deleteInference(row.name);
			ElMessage.success('删除已提交');
			loadList();
		})
		.catch(() => {});
};

onMounted(async () => {
	// 注册表预热（best-effort）：失败不阻塞列表；抽屉打开前还会再 await 一次
	engineStore.ensureLoaded();
	loadList();
});
</script>

<style scoped lang="scss">
.create-form {
	padding-bottom: 8px;
}
.drawer-footer {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.drawer-footer__apply {
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--fill-soft, rgba(0, 0, 0, 0.03));
}
.drawer-footer__actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
.form-section + .form-section {
	margin-top: 4px;
	padding-top: 14px;
	border-top: 1px solid var(--line-soft);
}
.form-section__title {
	margin-bottom: 12px;
	font-size: 13px;
	font-weight: 600;
	color: var(--ink);
}
.form-tip {
	width: 100%;
	margin-top: 4px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--ink-low);
}
.form-tip--inline {
	width: auto;
	margin-top: 0;
	margin-left: 12px;
}
.option-meta {
	float: right;
	padding-left: 12px;
	font-size: 12px;
	color: var(--ink-low);
}
.model-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	margin-top: 8px;
	font-family: var(--font-mono);
	font-size: 12px;
	color: var(--ink-mid);
}
.model-meta__path {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.mount-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
}
.mount-meta {
	padding: 6px 10px;
	border-radius: 6px;
	background: var(--fill-soft, rgba(0, 0, 0, 0.03));
}
.mount-meta__row {
	display: flex;
	gap: 8px;
	font-family: var(--font-mono);
	font-size: 12px;
	line-height: 1.8;
	color: var(--ink-mid);
}
.mount-meta__label {
	flex: 0 0 56px;
	color: var(--ink-low);
}
.mount-meta__path {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.mount-preview {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-family: var(--font-mono);
	font-size: 12px;
	line-height: 1.6;
	color: var(--ink-mid);
}
.param-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	column-gap: 16px;
}
.compat-line {
	width: 100%;
	margin-top: 6px;
	font-size: 12px;
	line-height: 1.5;
	&--ok {
		color: var(--el-color-success);
	}
	&--bad {
		color: var(--el-color-danger);
	}
	&--warn {
		color: var(--el-color-warning);
	}
}
.adv-collapse {
	margin-left: -8px;
	border-top: none;
	border-bottom: none;
	:deep(.el-collapse-item__header) {
		height: 32px;
		background: transparent;
		border-bottom: none;
	}
	:deep(.el-collapse-item__wrap) {
		background: transparent;
		border-bottom: none;
	}
}
.adv-title {
	font-size: 13px;
	color: var(--ink-mid);
}
.affinity-preview {
	width: 100%;
	margin-top: 6px;
	font-family: var(--font-mono);
	font-size: 12px;
	line-height: 1.5;
	color: var(--ink-mid);
}
.kv-list {
	width: 100%;
}
.kv-row {
	display: grid;
	grid-template-columns: 1fr 1fr auto;
	gap: 8px;
	margin-bottom: 8px;
	&--3 {
		grid-template-columns: 1fr 1fr 1fr auto;
	}
}
.probe-row {
	margin-bottom: 14px;
	&__main {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	&__name {
		width: 140px;
		font-size: 13px;
		color: var(--ink);
	}
}
.gw-cfg-card {
	border: 1px solid var(--el-border-color-lighter);
	border-radius: 6px;
	padding: 14px;
	margin-bottom: 16px;
	.gw-cfg-head {
		display: flex;
		align-items: center;
		gap: 8px;
		.gw-cfg-name {
			font-weight: 600;
			font-size: 14px;
		}
	}
	.gw-cfg-add {
		display: flex;
		gap: 8px;
		margin-top: 10px;
		.el-input {
			flex: 1;
		}
	}
}
</style>
