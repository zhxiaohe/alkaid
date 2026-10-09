<template>
	<div class="portal-home">
		<!-- Banner -->
		<section class="banner">
			<div class="banner-inner">
				<div class="banner-brand">
				<AlkaidLogo variant="wordmark" :size="44" />
			</div>
			<h1 class="banner-title">AI 推理训练一体化运维平台</h1>
				<p class="banner-subtitle">模型体验 · 推理部署 · 训练管理 · 模型仓库，一站式 AI 基础设施</p>
				<div class="banner-actions">
					<el-button type="primary" size="large" :icon="ChatDotRound" @click="router.push('/playground/text')">立即体验</el-button>
					<el-button size="large" :icon="Cpu" @click="router.push('/inference/list')">进入控制台</el-button>
				</div>
			</div>
		</section>

		<!-- 概览统计卡（数据来自各模块 list 接口的 total） -->
		<section class="overview">
			<el-row :gutter="16">
				<el-col :xs="12" :sm="6" v-for="c in statCards" :key="c.title">
					<el-card shadow="hover" class="stat-card" :body-style="{ padding: '20px' }">
						<div class="stat-icon" :style="{ background: c.color }">
							<el-icon :size="28"><component :is="c.icon" /></el-icon>
						</div>
						<div class="stat-info">
							<div class="stat-count">{{ c.loading ? '…' : c.count ?? '—' }}</div>
							<div class="stat-title">{{ c.title }}</div>
						</div>
					</el-card>
				</el-col>
			</el-row>
		</section>

		<!-- 功能分类 Tab -->
		<section class="feature-tabs">
			<el-tabs v-model="activeTab" class="feature-tab-container">
				<el-tab-pane label="模型体验" name="playground">
					<el-row :gutter="16">
						<el-col :xs="24" :sm="8" v-for="c in playgroundCards" :key="c.title">
							<el-card shadow="hover" class="feature-card" tabindex="0" role="link" @click="router.push(c.path)" @keyup.enter="router.push(c.path)">
								<div class="fc-icon" :style="{ background: c.color }">
									<el-icon :size="36"><component :is="c.icon" /></el-icon>
								</div>
								<div class="fc-title">{{ c.title }}</div>
								<div class="fc-desc">{{ c.desc }}</div>
								<div class="fc-enter">进入体验 →</div>
							</el-card>
						</el-col>
					</el-row>
				</el-tab-pane>

				<el-tab-pane label="推理部署" name="inference">
					<el-row :gutter="16">
						<el-col :xs="24" :sm="8">
							<el-card shadow="hover" class="feature-card" tabindex="0" role="link" @click="router.push('/inference/list')" @keyup.enter="router.push('/inference/list')">
								<div class="fc-icon" style="background:linear-gradient(135deg,#0866FF,#4a90ff)"><el-icon :size="36"><Cpu /></el-icon></div>
								<div class="fc-title">推理服务管理</div>
								<div class="fc-desc">vLLM/SGLang/TGI 裸部署 · Higress 网关路由 · KEDA 弹性伸缩</div>
								<div class="fc-enter">进入 →</div>
							</el-card>
						</el-col>
						<el-col :xs="24" :sm="8">
							<el-card shadow="hover" class="feature-card" tabindex="0" role="link" @click="router.push('/model/list')" @keyup.enter="router.push('/model/list')">
								<div class="fc-icon" style="background:linear-gradient(135deg,#D97706,#F0B429)"><el-icon :size="36"><Files /></el-icon></div>
								<div class="fc-title">模型版本管理</div>
								<div class="fc-desc">版本状态机 staged→production→archived · Promote/Rollback/Archive</div>
								<div class="fc-enter">进入 →</div>
							</el-card>
						</el-col>
						<el-col :xs="24" :sm="8">
							<el-card shadow="never" class="feature-card feature-card--plan">
								<div class="fc-icon" style="background:var(--ink-low)"><el-icon :size="36"><Connection /></el-icon></div>
								<div class="fc-title">InferencePool 路由<span class="plan-badge">规划中</span></div>
								<div class="fc-desc">KV-Cache 感知智能路由 · 多版本灰度 · 自动故障转移</div>
								<div class="fc-enter fc-enter--plan">暂未开放</div>
							</el-card>
						</el-col>
					</el-row>
				</el-tab-pane>

				<el-tab-pane label="训练管理" name="training">
					<el-row :gutter="16">
						<el-col :xs="24" :sm="8">
							<el-card shadow="hover" class="feature-card" tabindex="0" role="link" @click="router.push('/training/list')" @keyup.enter="router.push('/training/list')">
								<div class="fc-icon" style="background:linear-gradient(135deg,#16A34A,#3ECC7E)"><el-icon :size="36"><DataAnalysis /></el-icon></div>
								<div class="fc-title">训练任务管理</div>
								<div class="fc-desc">LLaMA-Factory LoRA/QLoRA/Full-SFT · Volcano gang 调度</div>
								<div class="fc-enter">进入 →</div>
							</el-card>
						</el-col>
						<el-col :xs="24" :sm="8">
							<el-card shadow="never" class="feature-card feature-card--plan">
								<div class="fc-icon" style="background:var(--ink-low)"><el-icon :size="36"><MagicStick /></el-icon></div>
								<div class="fc-title">实验追踪 MLflow<span class="plan-badge">规划中</span></div>
								<div class="fc-desc">Run 记录 · 参数对比 · 指标可视化 · 模型版本注册</div>
								<div class="fc-enter fc-enter--plan">暂未开放</div>
							</el-card>
						</el-col>
						<el-col :xs="24" :sm="8">
							<el-card shadow="never" class="feature-card feature-card--plan">
								<div class="fc-icon" style="background:var(--ink-low)"><el-icon :size="36"><Medal /></el-icon></div>
								<div class="fc-title">模型评估<span class="plan-badge">规划中</span></div>
								<div class="fc-desc">自动评测流水线 · Acc/BLEU/MMLU · 评估报告联动 Promote</div>
								<div class="fc-enter fc-enter--plan">暂未开放</div>
							</el-card>
						</el-col>
					</el-row>
				</el-tab-pane>
			</el-tabs>
		</section>
	</div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AlkaidLogo from '/@/components/Brand/AlkaidLogo.vue';
import { useEnvStore } from '/@/stores/env';
import { getHomeStats, type HomeStats } from '/@/api/home';
import {
	Cpu, ChatDotRound, ChatLineSquare, Microphone, PictureFilled,
	Files, DataAnalysis, Connection, MagicStick, Medal, Promotion, Monitor,
} from '@element-plus/icons-vue';

const router = useRouter();
const activeTab = ref('playground');

// 概览统计：调用各模块 list 接口（page=1&size=1）读取 total，失败显示 —
interface StatCard { title: string; count: number | null; loading: boolean; icon: unknown; color: string }
const statCards = reactive<StatCard[]>([
	{ title: '推理服务', count: null, loading: true, icon: Cpu, color: 'linear-gradient(135deg,#0866FF,#4a90ff)' },
	{ title: '训练任务', count: null, loading: true, icon: DataAnalysis, color: 'linear-gradient(135deg,#16A34A,#3ECC7E)' },
	{ title: '模型版本', count: null, loading: true, icon: Files, color: 'linear-gradient(135deg,#D97706,#F0B429)' },
	{ title: 'GPU 节点', count: null, loading: true, icon: Monitor, color: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' },
]);

// 真实统计：按当前环境拉取后端聚合接口，环境切换后自动刷新
const envStore = useEnvStore();
const statsLoading = ref(false);
async function loadStats() {
	statsLoading.value = true;
	statCards.forEach((c) => (c.loading = true));
	try {
		const s = (await getHomeStats()) as unknown as HomeStats;
		if (s) {
			statCards[0].count = s.inference_total;
			statCards[1].count = s.training_total;
			statCards[2].count = s.version_total;
			statCards[3].count = s.gpu_total;
		}
	} catch {
		/* 拦截器已提示，卡片回落为「—」，不阻塞其它模块 */
	} finally {
		statsLoading.value = false;
		// 必须在这里收尾，否则卡片会永远停在「…」占位态
		statCards.forEach((c) => (c.loading = false));
	}
}
watch(() => envStore.currentEnv, () => loadStats());

onMounted(async () => {
	await loadStats();
});

const playgroundCards = [
	{ title: '文本对话', desc: '通用对话 · 指令跟随 · 代码生成 · 长文本摘要', icon: ChatLineSquare, color: 'linear-gradient(135deg,#0866FF,#22D3EE)', path: '/playground/text' },
	{ title: '语音对话', desc: 'ASR 语音识别 · TTS 语音合成 · 语音交互体验', icon: Microphone, color: 'linear-gradient(135deg,#16A34A,#22D3EE)', path: '/playground/voice' },
	{ title: '多模态理解', desc: '图片描述 · VQA 问答 · OCR 识别 · 视频理解', icon: PictureFilled, color: 'linear-gradient(135deg,#D97706,#F0B429)', path: '/playground/multimodal' },
];
</script>

<style scoped lang="scss">
.portal-home {
	min-height: 100%;
}

/* Banner：主题化渐变（浅=晴界 / 暗=玄夜） */
.banner {
	background: var(--banner-grad);
	padding: 60px 24px 80px;
	color: var(--banner-text);
	// Banner 在极光 / 玄夜 / 曜黑下是深底，字标改用反色字
	--logo-word: var(--logo-word-inv);
	position: relative;
	overflow: hidden;
	transition: background 0.25s;
	&::before {
		content: '';
		position: absolute;
		top: -50%;
		right: -20%;
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, var(--glow) 0%, transparent 70%);
		border-radius: 50%;
		opacity: 0.35;
	}
}
.banner-inner {
	max-width: 1100px;
	margin: 0 auto;
	position: relative;
	z-index: 1;
}
.banner-brand {
	margin: 0 0 14px;
}
.banner-title {
	font-size: 36px;
	font-weight: 700;
	margin: 0 0 16px;
	letter-spacing: 1px;
}
.banner-subtitle {
	font-size: 16px;
	color: var(--banner-sub);
	margin: 0 0 28px;
}
.banner-actions {
	display: flex;
	gap: 12px;
}

/* 概览统计：上浮压住 Banner */
.overview {
	max-width: 1100px;
	margin: -40px auto 0;
	padding: 0 24px;
	position: relative;
	z-index: 2;
}
// 修复：嵌套错误导致 el-card__body 的 flex 永不生效
.stat-card {
	border-radius: 12px;
	:deep(.el-card__body) {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.stat-icon {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--on-brand);
		flex-shrink: 0;
	}
	.stat-info { flex: 1; }
	.stat-count {
		font-family: var(--font-mono);
		font-size: 24px;
		font-weight: 700;
		color: var(--ink);
	}
	.stat-title { font-size: 13px; color: var(--ink-mid); margin-top: 4px; }
}

/* 功能分类 */
.feature-tabs {
	max-width: 1100px;
	margin: 40px auto;
	padding: 0 24px;
}
.feature-tab-container {
	:deep(.el-tabs__header) { margin-bottom: 24px; }
}
.feature-card {
	height: 100%;
	cursor: pointer;
	border-radius: 12px;
	transition: all 0.25s;
	position: relative;
	overflow: hidden;
	&:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}
	&:hover {
		transform: translateY(-4px);
		box-shadow: var(--shadow-card-hover);
	}
	// hover 顶部渐变发丝线
	&::after {
		content: '';
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--brand), var(--brand-hover));
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 0.25s;
	}
	&:hover::after { transform: scaleX(1); }
	:deep(.el-card__body) { padding: 28px; }
	&--plan {
		cursor: default;
		opacity: 0.62;
		&:hover { transform: none; box-shadow: none; }
		&::after { display: none; }
	}
}
.fc-icon {
	width: 64px;
	height: 64px;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--on-brand);
	margin-bottom: 20px;
}
.fc-title {
	font-size: 18px;
	font-weight: 600;
	color: var(--ink);
	margin-bottom: 10px;
}
.plan-badge {
	font-size: 11px;
	color: var(--ink-mid);
	border: 1px solid var(--line);
	border-radius: 999px;
	padding: 1px 10px;
	margin-left: 8px;
	vertical-align: 2px;
	font-weight: 400;
}
.fc-desc {
	font-size: 13px;
	color: var(--ink-mid);
	line-height: 1.6;
	margin-bottom: 16px;
	min-height: 42px;
}
.fc-enter {
	font-size: 13px;
	color: var(--brand);
	font-weight: 500;
	&--plan { color: var(--ink-low); }
}
</style>
