<template>
	<div class="mm-page">
		<el-row :gutter="20">
			<!-- 左侧：上传 + 选择 -->
			<el-col :xs="24" :sm="10">
				<el-card shadow="hover">
					<template #header>
						<div class="card-header"><el-icon><UploadFilled /></el-icon><span>输入</span></div>
					</template>

					<!-- 图片上传 -->
					<el-tabs v-model="inputType">
						<el-tab-pane label="图片" name="image">
							<el-upload
								drag
								:show-file-list="false"
								:on-success="handleImageUpload"
								accept="image/*"
								:auto-upload="false"
							>
								<el-icon :size="40" color="#c0c4cc"><Plus /></el-icon>
								<div class="el-upload__text">点击或拖拽上传图片</div>
								<div class="el-upload__tip">支持 JPG/PNG，建议 ≤ 10MB</div>
							</el-upload>
							<div v-if="imageUrl" class="preview-wrap">
								<img :src="imageUrl" class="preview" />
							</div>
						</el-tab-pane>

						<el-tab-pane label="视频" name="video">
							<el-upload drag :show-file-list="false" :on-success="handleVideoUpload" accept="video/*" :auto-upload="false">
								<el-icon :size="40" color="#c0c4cc"><VideoCameraFilled /></el-icon>
								<div class="el-upload__text">点击或拖拽上传视频</div>
								<div class="el-upload__tip">支持 MP4，建议 ≤ 50MB（MVP Demo，暂仅支持封面帧理解）</div>
							</el-upload>
							<div v-if="videoUrl" class="preview-wrap">
								<video :src="videoUrl" class="preview" controls />
							</div>
						</el-tab-pane>
					</el-tabs>

					<!-- 模型选择 -->
					<el-divider />
					<div class="model-select">
						<el-select v-model="model" placeholder="选择多模态模型" style="width: 100%">
							<el-option v-for="m in models" :key="m" :label="m" :value="m" />
						</el-select>
					</div>
				</el-card>
			</el-col>

			<!-- 右侧：交互 + 结果 -->
			<el-col :xs="24" :sm="14">
				<el-card shadow="hover">
					<template #header>
						<div class="card-header"><el-icon><PictureFilled /></el-icon><span>交互 & 结果</span></div>
					</template>

					<!-- 预置任务 -->
					<div class="task-row">
						<span class="task-label">选择任务：</span>
						<el-radio-group v-model="task">
							<el-radio-button label="describe">图片描述</el-radio-button>
							<el-radio-button label="vqa">VQA 问答</el-radio-button>
							<el-radio-button label="ocr">OCR 文字识别</el-radio-button>
						</el-radio-group>
					</div>

					<!-- 自定义问题（VQA 时显示） -->
					<div v-if="task === 'vqa'" class="question-row">
						<el-input v-model="question" placeholder="输入你的问题，如：图片中有几只猫？" />
					</div>

					<!-- 动作按钮 -->
					<div class="action-row">
						<el-button type="primary" :icon="Promotion" :loading="processing" :disabled="!canSubmit" @click="runInference">
							{{ processing ? '分析中...' : '开始分析' }}
						</el-button>
						<el-button :icon="Refresh" @click="resetAll">清空</el-button>
					</div>

					<!-- 结果展示 -->
					<el-divider v-if="result" />
					<div v-if="result" class="result-area">
						<div class="result-label">{{ taskLabel }} 结果</div>
						<div class="result-content">{{ result }}</div>
						<div class="result-meta">
							<el-tag size="small" type="info">模型：{{ model }}</el-tag>
							<el-tag size="small" type="success">耗时：{{ latency }}ms</el-tag>
						</div>
					</div>
					<el-empty v-else description="上传图片/视频后，点击开始分析" />
				</el-card>

				<el-card shadow="never" class="m-t-15">
					<template #header><div class="card-header"><el-icon><InfoFilled /></el-icon><span>能力说明</span></div></template>
					<ul class="capability-list">
						<li>图片描述：自动生成图片的自然语言描述</li>
						<li>VQA 视觉问答：针对图片回答用户的自然语言问题</li>
						<li>OCR 文字识别：从图片中提取印刷体/手写体文字</li>
						<li>当前为 MVP Demo：使用前端 mock 数据，后续接多模态推理服务（如 Qwen-VL/GPT-4V）</li>
					</ul>
				</el-card>
			</el-col>
		</el-row>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { UploadFilled, Plus, VideoCameraFilled, PictureFilled, Promotion, Refresh, InfoFilled } from '@element-plus/icons-vue';
import { ElMessage, type UploadRawFile } from 'element-plus';

const inputType = ref<'image' | 'video'>('image');
const imageUrl = ref('');
const videoUrl = ref('');
const model = ref('Qwen-VL-72B');
const task = ref<'describe' | 'vqa' | 'ocr'>('describe');
const question = ref('');
const processing = ref(false);
const result = ref('');
const latency = ref(0);

const models = ['Qwen-VL-72B', 'Qwen-VL-7B', 'GPT-4V', 'LLaVA-7B'];

const taskLabel = computed(() => ({ describe: '图片描述', vqa: 'VQA 问答', ocr: 'OCR 识别' } as const)[task.value]);

const canSubmit = computed(() => {
	if (task.value === 'vqa') return !!question.value.trim() && (!!imageUrl.value || !!videoUrl.value);
	return !!imageUrl.value || !!videoUrl.value;
});

const handleImageUpload = (file: any) => {
	const f = file.raw as UploadRawFile;
	const reader = new FileReader();
	reader.onload = (e) => { imageUrl.value = e.target?.result as string; };
	reader.readAsDataURL(f);
};
const handleVideoUpload = (file: any) => {
	const f = file.raw as UploadRawFile;
	videoUrl.value = URL.createObjectURL(f);
};

const mockResults: Record<string, Record<string, string>> = {
	describe: {
		'Qwen-VL-72B': '这是一张**城市街景**照片。画面中央是一条宽阔的双向车道，两侧是现代化的玻璃幕墙建筑。天空晴朗，光线充足，时间大约是上午。街道上有一些行人和车辆，整体氛围繁忙而有序。',
	},
	vqa: {
		'几只': '根据图片内容，我能看到大约 **2 只**橘色的猫，它们正蜷缩在一张**木质桌子**上晒太阳。',
		'天气': '从图片中明亮的光线和蓝天来看，拍摄当天应该是**晴朗的好天气**。',
	},
	ocr: {
		'generic': '识别到以下文字：\n\n```\n会议纪要\n时间：2026年9月7日 14:00\n地点：A 会议室\n参会人：张三、李四、王五\n\n议题：\n1. 项目进度同步\n2. Q4 OKR 对齐\n3. AI 运维平台 MVP 验收\n```',
	},
};

const runInference = async () => {
	if (!canSubmit.value) return;
	processing.value = true;
	result.value = '';
	const start = Date.now();
	await new Promise((r) => setTimeout(r, 1200));

	if (task.value === 'describe') result.value = mockResults.describe[model.value] || '这是一张图片，包含一些有趣的视觉内容（mock 回复）。';
	else if (task.value === 'vqa') {
		const q = question.value;
		const key = Object.keys(mockResults.vqa).find((k) => q.includes(k));
		result.value = (key && mockResults.vqa[key]) || `关于「${q}」，这是一张 mock 图片，真实部署后将由 ${model.value} 回答。`;
	} else if (task.value === 'ocr') result.value = mockResults.ocr.generic;

	latency.value = Date.now() - start;
	processing.value = false;
	ElMessage.success('分析完成');
};

const resetAll = () => {
	imageUrl.value = ''; videoUrl.value = '';
	result.value = ''; question.value = '';
	latency.value = 0;
};
</script>

<style scoped lang="scss">
.mm-page { max-width: 1100px; }
.card-header {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
}
.m-l-auto { margin-left: auto; }
.preview-wrap {
	margin-top: 12px;
	text-align: center;
	.preview { max-width: 100%; max-height: 240px; border-radius: 6px; }
}
.task-row {
	display: flex;
	align-items: center;
	gap: 12px;
	.task-label { font-size: 13px; color: #606266; }
}
.question-row { margin-top: 12px; }
.action-row {
	display: flex;
	gap: 10px;
	margin-top: 16px;
}
.result-area {
	background: #f5f7fa;
	border-radius: 8px;
	padding: 16px;
	.result-label { font-size: 12px; color: #909399; margin-bottom: 8px; }
	.result-content {
		font-size: 14px; line-height: 1.7; color: #303133; white-space: pre-wrap;
		:deep(code) { background: #e4e7ed; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
		:deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
		strong { font-weight: 600; color: #303133; }
	}
	.result-meta {
		display: flex; gap: 8px; margin-top: 12px;
	}
}
.capability-list { padding-left: 18px; color: #606266; font-size: 13px; line-height: 1.8; }
</style>
