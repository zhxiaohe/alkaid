<template>
	<div class="voice-page">
		<el-card shadow="hover" class="voice-card">
			<template #header>
				<div class="card-header">
					<el-icon :size="20"><Microphone /></el-icon>
					<span>语音对话</span>
					<el-tag type="info" size="small" class="m-l-auto">MVP Demo</el-tag>
				</div>
			</template>

			<div class="voice-controls">
				<!-- 录音按钮 -->
				<div class="record-btn-wrap">
					<button
						class="record-btn"
						:class="{ recording: isRecording }"
						@click="toggleRecord"
						:disabled="processing"
					>
						<el-icon :size="36"><Microphone v-if="!isRecording" /><VideoPause v-else /></el-icon>
					</button>
					<div class="record-hint">{{ isRecording ? '点击停止录音' : '点击开始录音' }}</div>
					<div v-if="recordingTime > 0" class="record-time">{{ formatTime(recordingTime) }}</div>
				</div>

				<!-- 文本输入（备选） -->
				<div class="text-input">
					<el-input v-model="textInput" type="textarea" :rows="2" placeholder="或直接输入文本（Ctrl+Enter 发送）" @keydown.ctrl.enter="sendText" />
					<el-button type="primary" :icon="Promotion" @click="sendText" :disabled="!textInput.trim() || processing">发送</el-button>
				</div>
			</div>

			<!-- 对话记录 -->
			<div class="voice-history" ref="historyRef">
				<div v-if="!history.length" class="empty-hint">
					<el-icon :size="48" color="#c0c4cc"><ChatLineSquare /></el-icon>
					<p>暂无对话记录，试试录音或直接输入文本</p>
				</div>
				<div v-for="(h, i) in history" :key="i" class="history-item" :class="h.role">
					<div class="hi-avatar">{{ h.role === 'user' ? '🧑' : '🤖' }}</div>
					<div class="hi-content">
						<div class="hi-text">{{ h.text }}</div>
						<div v-if="h.role === 'assistant'" class="hi-audio">
							<el-button size="small" :icon="VideoPlay" circle @click="playTTS(h.audioText)" />
							<span class="tts-label">点击播放语音回复</span>
						</div>
						<div class="hi-time">{{ h.time }}</div>
					</div>
				</div>
			</div>
		</el-card>

		<el-card shadow="never" class="m-t-15">
			<template #header>
				<div class="card-header"><el-icon><InfoFilled /></el-icon><span>能力说明</span></div>
			</template>
			<ul class="capability-list">
				<li>ASR 语音识别：浏览器 Web Audio API 采集 → 后端 ASR 服务转写为文本</li>
				<li>LLM 推理：文本送入推理服务，生成回复</li>
				<li>TTS 语音合成：回复文本送入 TTS 服务，返回音频播放</li>
				<li>当前为 MVP Demo：录音走浏览器 Mock、TTS 用 SpeechSynthesis API、LLM 用 mock 回复</li>
			</ul>
		</el-card>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { Microphone, VideoPause, Promotion, VideoPlay, ChatLineSquare, InfoFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

interface VoiceItem { role: 'user' | 'assistant'; text: string; audioText?: string; time: string }

const isRecording = ref(false);
const recordingTime = ref(0);
const processing = ref(false);
const textInput = ref('');
const history = ref<VoiceItem[]>([]);
const historyRef = ref<HTMLElement>();

let timer: number | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const nowStr = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const scrollBottom = () => nextTick(() => historyRef.value?.scrollTo({ top: historyRef.value.scrollHeight, behavior: 'smooth' }));

const toggleRecord = async () => {
	if (isRecording.value) {
		stopRecord();
	} else {
		await startRecord();
	}
};

const startRecord = async () => {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		mediaRecorder = new MediaRecorder(stream);
		audioChunks = [];
		mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
		mediaRecorder.onstop = async () => {
			stream.getTracks().forEach((t) => t.stop());
			// MVP：不真做 ASR，让用户知道是 mock
			ElMessage.info('MVP Demo：ASR 走 mock，请使用文本输入');
		};
		mediaRecorder.start();
		isRecording.value = true;
		recordingTime.value = 0;
		timer = window.setInterval(() => { recordingTime.value++; }, 1000);
	} catch (e) {
		ElMessage.warning('未获取到麦克风权限，语音功能暂不可用');
	}
};

const stopRecord = () => {
	if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
	isRecording.value = false;
	if (timer) { clearInterval(timer); timer = null; }
	recordingTime.value = 0;
};

const mockReplies: Record<string, string> = {
	'你好': '你好！我是语音助手，有什么可以帮你的？',
	'今天天气怎么样': '抱歉，我还没有接入天气 API。不过你可以试试其他问题～',
};

const sendText = async () => {
	const text = textInput.value.trim();
	if (!text || processing.value) return;
	history.value.push({ role: 'user', text, time: nowStr() });
	textInput.value = '';
	processing.value = true;
	scrollBottom();

	// mock 回复
	await new Promise((r) => setTimeout(r, 600));
	const reply = mockReplies[text] || `收到你的消息：「${text}」\n\n这是语音助手的 mock 回复，后续将接入真实 LLM + TTS 流水线。`;
	history.value.push({ role: 'assistant', text: reply, audioText: reply, time: nowStr() });
	processing.value = false;
	scrollBottom();
};

const playTTS = (text: string) => {
	if (!('speechSynthesis' in window)) { ElMessage.warning('当前浏览器不支持语音播放'); return; }
	const utter = new SpeechSynthesisUtterance(text);
	utter.lang = 'zh-CN';
	window.speechSynthesis.speak(utter);
};

onMounted(() => {
	history.value.push({ role: 'assistant', text: '👋 你好！我是语音助手，录音或输入文字都可以和我交流。', audioText: '你好！我是语音助手，录音或输入文字都可以和我交流。', time: nowStr() });
});
onUnmounted(() => stopRecord());
</script>

<style scoped lang="scss">
.voice-page {
	max-width: 720px;
	margin: 0 auto;
}
.card-header {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
	.m-l-auto { margin-left: auto; }
}
.voice-controls {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 20px;
	padding: 20px 0;
}
.record-btn-wrap {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
}
.record-btn {
	width: 100px;
	height: 100px;
	border-radius: 50%;
	border: none;
	background: #409eff;
	color: #fff;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s;
	&:hover { transform: scale(1.05); }
	&.recording {
		background: #f56c6c;
		animation: pulse 1s infinite;
	}
	&:disabled { opacity: 0.6; cursor: not-allowed; }
}
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.6); } 50% { box-shadow: 0 0 0 16px rgba(245, 108, 108, 0); } }
.record-hint { font-size: 13px; color: #606266; }
.record-time { font-family: 'Menlo', monospace; font-size: 20px; color: #f56c6c; font-weight: 600; }
.text-input {
	width: 100%;
	display: flex;
	gap: 10px;
	align-items: flex-start;
}
.voice-history {
	max-height: 400px;
	overflow-y: auto;
	border-top: 1px solid #ebeef5;
	padding-top: 16px;
}
.empty-hint {
	text-align: center;
	color: #909399;
	padding: 40px;
	p { margin-top: 10px; font-size: 13px; }
}
.history-item {
	display: flex;
	gap: 10px;
	margin-bottom: 16px;
	&.user { flex-direction: row-reverse; .hi-content { background: #ecf5ff; } }
}
.hi-avatar {
	width: 32px; height: 32px; border-radius: 50%; background: #e4e7ed;
	display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
}
.hi-content {
	max-width: 70%;
	background: #f5f7fa;
	padding: 10px 14px;
	border-radius: 10px;
}
.hi-text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.hi-audio { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.tts-label { font-size: 12px; color: #409eff; }
.hi-time { font-size: 11px; color: #c0c4cc; margin-top: 4px; }
.capability-list { padding-left: 18px; color: #606266; font-size: 13px; line-height: 1.8; }
</style>
