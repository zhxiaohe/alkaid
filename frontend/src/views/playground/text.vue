<template>
	<div class="chat-page">
		<!-- 顶部模型选择 -->
		<div class="chat-header">
			<el-select v-model="model" placeholder="选择模型" style="width: 240px">
				<el-option v-for="m in availableModels" :key="m.name" :label="`${m.name} (${m.desc})`" :value="m.name" />
			</el-select>
			<div class="header-right">
				<el-slider v-model="temperature" :min="0" :max="2" :step="0.1" style="width: 140px" />
				<span class="param-label">温度 {{ temperature.toFixed(1) }}</span>
				<el-button :icon="Refresh" @click="resetChat">清空对话</el-button>
			</div>
		</div>

		<!-- 对话区 -->
		<div class="chat-body" ref="chatBodyRef" @scroll="onScroll">
			<div v-if="!messages.length" class="chat-placeholder">
				<div class="placeholder-title">👋 开始与 {{ model }} 对话</div>
				<div class="placeholder-tips">试试这些提示词：</div>
				<div class="prompt-suggestions">
					<el-button v-for="p in prompts" :key="p" size="small" @click="sendFromSuggestion(p)">{{ p }}</el-button>
				</div>
			</div>
			<div v-for="(msg, i) in messages" :key="i" class="chat-msg" :class="msg.role">
				<div class="msg-avatar">{{ msg.role === 'user' ? '🧑' : '🤖' }}</div>
				<div class="msg-content">
					<div v-if="msg.role === 'user'">{{ msg.content }}</div>
					<div v-else class="assistant-content" v-html="formatMd(msg.content)"></div>
					<div v-if="msg.streaming" class="typing-indicator">
						<span></span><span></span><span></span>
					</div>
				</div>
			</div>
		</div>

		<!-- 输入区：流式生成期间输入框保持可编辑（不清空/不锁死用户输入），仅禁用发送 -->
		<div class="chat-input">
			<el-input
				v-model="input"
				type="textarea"
				:rows="3"
				placeholder="输入消息，Ctrl/Cmd + Enter 发送"
				@keydown.ctrl.enter="sendMessage"
				@keydown.meta.enter="sendMessage"
				resize="none"
			/>
			<div class="input-actions">
				<span class="input-hint">Ctrl + Enter 发送</span>
				<div class="action-btns">
					<el-button v-if="streaming" type="danger" plain :icon="VideoPause" @click="stopGeneration">停止生成</el-button>
					<el-button type="primary" :icon="Promotion" :loading="streaming" @click="sendMessage" :disabled="!input.trim()">
						{{ streaming ? '生成中...' : '发送' }}
					</el-button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';
import { Refresh, Promotion, VideoPause } from '@element-plus/icons-vue';

interface Msg { role: 'user' | 'assistant'; content: string; streaming?: boolean }

const model = ref('Qwen2.5-72B');
const temperature = ref(0.7);
const input = ref('');
const messages = ref<Msg[]>([]);
const streaming = ref(false);
const chatBodyRef = ref<HTMLElement>();
// 用户是否主动停止生成 / 是否停留在底部（自动跟随滚动）
const stopped = ref(false);
const stickToBottom = ref(true);

const availableModels = [
	{ name: 'Qwen2.5-72B', desc: '通义千问 72B' },
	{ name: 'Qwen2.5-7B', desc: '通义千问 7B' },
	{ name: 'CodeLlama-34B', desc: '代码生成' },
	{ name: 'BGE-M3', desc: '向量嵌入' },
];

const prompts = [
	'帮我写一个 Go 语言的 HTTP 中间件',
	'解释一下 Transformer 的注意力机制',
	'把以下中文翻译成英文并润色',
	'写一首关于 AI 的科幻短篇小说开头',
];

// 先转义 HTML 再做 markdown 替换，防止 LLM 输出中的 <script>/<img onerror> 注入（XSS）
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const formatMd = (raw: string) => {
	const s = escapeHtml(raw);
	return s
		.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\n/g, '<br/>');
};

const scrollToBottom = () => nextTick(() => chatBodyRef.value?.scrollTo({ top: chatBodyRef.value.scrollHeight, behavior: 'smooth' }));

// 用户向上滚动回看时暂停自动跟随，滚回底部则恢复
const onScroll = () => {
	const el = chatBodyRef.value;
	if (!el) return;
	stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
};

const sendFromSuggestion = (p: string) => { input.value = p; sendMessage(); };

const resetChat = () => {
	if (streaming.value) stopGeneration();
	messages.value = [];
};

const stopGeneration = () => {
	stopped.value = true;
	const last = messages.value[messages.value.length - 1];
	if (last?.streaming) last.streaming = false;
	streaming.value = false;
};

const sendMessage = async () => {
	const text = input.value.trim();
	if (!text || streaming.value) return;
	messages.value.push({ role: 'user', content: text });
	input.value = ''; // 发送后才清空输入
	stopped.value = false;
	stickToBottom.value = true;
	const aiMsg: Msg = { role: 'assistant', content: '', streaming: true };
	messages.value.push(aiMsg);
	streaming.value = true;
	scrollToBottom();

	// Mock 流式回复（后续接真实 vLLM SSE）
	const mockReplies: Record<string, string> = {
		'帮我写一个 Go 语言的 HTTP 中间件': '好的，这是一个通用的 **Gin HTTP 中间件** 示例，支持 JWT 鉴权 + 请求日志：\n```go\nfunc AuthMiddleware() gin.HandlerFunc {\n    return func(c *gin.Context) {\n        token := c.GetHeader("Authorization")\n        if token == "" {\n            c.AbortWithStatusJSON(401, gin.H{"code": 401, "message": "未登录"})\n            return\n        }\n        c.Next()\n    }\n}\n```',
		'解释一下 Transformer 的注意力机制': 'Transformer 的**自注意力（Self-Attention）**是整个架构的核心...\n\n1. **Q/K/V 计算**：输入通过线性变换得到 Query、Key、Value\n2. **注意力分数**：`score = Q × Kᵀ / √dₖ`\n3. **Softmax 归一化** → 加权求和得到注意力输出\n4. **多头并行**：多组 Q/K/V 分别计算再拼接',
	};
	const reply = mockReplies[text] || `我是 ${model.value}（温度 ${temperature.value.toFixed(1)}），这是一个 mock 回复。\n\n真实部署后将通过 Higress 网关调用 vLLM 推理服务，支持 SSE 流式输出。\n\n> 当前为 MVP 演示模式`;

	// 模拟打字效果：可随时"停止生成"中断
	for (let i = 0; i < reply.length; i += 2) {
		if (stopped.value) break;
		aiMsg.content = reply.slice(0, i + 2);
		if (stickToBottom.value) scrollToBottom();
		await new Promise((r) => setTimeout(r, 20));
	}
	aiMsg.streaming = false;
	streaming.value = false;
	if (stickToBottom.value) scrollToBottom();
};

onMounted(() => scrollToBottom());
</script>

<style scoped lang="scss">
.chat-page {
	display: flex;
	flex-direction: column;
	height: calc(100vh - 100px);
	background: var(--page-bg);
	border: 1px solid var(--line-soft);
	border-radius: 8px;
	overflow: hidden;
}
.chat-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 20px;
	background: var(--card-bg);
	border-bottom: 1px solid var(--line-soft);
	.header-right { display: flex; align-items: center; gap: 12px; }
	.param-label { font-size: 12px; color: var(--ink-mid); min-width: 90px; }
}
.chat-body {
	flex: 1;
	overflow-y: auto;
	padding: 20px;
}
.chat-placeholder {
	text-align: center;
	padding: 80px 20px;
	.placeholder-title { font-size: 20px; font-weight: 600; color: var(--ink); margin-bottom: 12px; }
	.placeholder-tips { font-size: 13px; color: var(--ink-mid); margin-bottom: 20px; }
}
.prompt-suggestions {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	justify-content: center;
}
.chat-msg {
	display: flex;
	gap: 12px;
	margin-bottom: 20px;
	&.user { flex-direction: row-reverse; .msg-content { background: var(--brand); color: var(--on-brand); } }
	&.assistant { .msg-content { background: var(--card-bg); border: 1px solid var(--line-soft); } }
}
.msg-avatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	background: var(--hover-bg);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 18px;
	flex-shrink: 0;
}
.msg-content {
	max-width: 70%;
	padding: 12px 16px;
	border-radius: 10px;
	font-size: 14px;
	line-height: 1.7;
	word-break: break-word;
}
.assistant-content {
	:deep(pre) { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin: 8px 0; }
	:deep(code) { background: var(--hover-bg); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
	:deep(pre code) { background: transparent; padding: 0; }
	strong { font-weight: 600; }
}
.typing-indicator {
	display: flex;
	gap: 4px;
	padding: 4px 0;
	span { width: 8px; height: 8px; background: var(--ink-low); border-radius: 50%; animation: blink 1.2s infinite; }
	span:nth-child(2) { animation-delay: 0.2s; }
	span:nth-child(3) { animation-delay: 0.4s; }
}
@keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
.chat-input {
	padding: 16px 20px;
	background: var(--card-bg);
	border-top: 1px solid var(--line-soft);
	.input-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
	.input-hint { font-size: 12px; color: var(--ink-mid); }
	.action-btns { display: flex; gap: 10px; }
}
</style>
