<template>
	<el-drawer v-model="visible" :title="title" size="60%" @opened="startStream" @closed="stopStream">
		<div class="log-wrap">
			<div class="log-toolbar">
				<el-tag size="small" :type="streaming ? 'success' : 'info'" effect="light">{{ streaming ? '跟随中' : '已停止' }}</el-tag>
				<span class="log-tip">{{ tip }}</span>
				<div style="flex: 1" />
				<el-button v-if="streaming" size="small" @click="stopStream">停止</el-button>
				<el-button v-else size="small" :disabled="!pod" @click="startStream">开始跟随</el-button>
				<el-button size="small" :disabled="!lines.length" @click="clear">清屏</el-button>
			</div>
			<div ref="boxRef" class="log-box">
				<pre v-for="(line, i) in lines" :key="i">{{ line }}</pre>
				<el-empty v-if="!lines.length && !streaming" description="暂无日志" :image-size="80" />
			</div>
		</div>
	</el-drawer>
</template>

<script setup lang="ts">
// PodLogsDrawer：实例日志（SSE 流式跟随，pod 级：/cluster/pods/:name/logs）。
// 与推理详情页「日志」页签同源同参（tail=200 + follow）：打开即自动跟随，关闭即断流。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { streamRequest } from '/@/utils/sse';
import type { ClusterPodItem } from '/@/api/cluster';

const props = defineProps<{ modelValue: boolean; pod: ClusterPodItem | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});
const title = computed(() => (props.pod ? `日志 · ${props.pod.name}` : '日志'));

const streaming = ref(false);
const lines = ref<string[]>([]);
const tip = ref('');
const boxRef = ref<HTMLElement | null>(null);
let ctrl: AbortController | null = null;

// 行缓冲上限：长跑日志不无限吃内存
const MAX_LOG_LINES = 2000;

const startStream = () => {
	if (!props.pod || streaming.value) return;
	lines.value = [];
	tip.value = `正在跟随 ${props.pod.name} 的日志…`;
	ctrl = new AbortController();
	const c = ctrl;
	streaming.value = true;
	streamRequest(
		`/cluster/pods/${encodeURIComponent(props.pod.name)}/logs`,
		{ namespace: props.pod.namespace, tail: 200, follow: 1 },
		{
			onMessage: (line) => {
				// ctrl 已过期（停止/切换实例后旧流的残余帧）直接丢弃
				if (ctrl !== c) return;
				const el = boxRef.value;
				// 用户停留在底部附近才自动跟随滚动，向上翻阅历史时不打扰
				const stick = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
				lines.value.push(line);
				if (lines.value.length > MAX_LOG_LINES) lines.value.splice(0, lines.value.length - MAX_LOG_LINES);
				if (stick && el) nextTick(() => (el.scrollTop = el.scrollHeight));
			},
			onEnd: () => {
				if (ctrl !== c) return;
				streaming.value = false;
				ctrl = null;
				tip.value = '日志流已结束（实例可能已重建或终止）';
			},
			onError: (message) => {
				if (ctrl !== c) return;
				streaming.value = false;
				ctrl = null;
				tip.value = `日志拉取失败：${message}`;
				ElMessage.error(message);
			},
		},
		c.signal
	);
};

const stopStream = () => {
	if (ctrl) {
		ctrl.abort();
		ctrl = null;
	}
	streaming.value = false;
};

const clear = () => (lines.value = []);

// 外部把 pod 置空（如切环境）时关闭抽屉，避免日志流挂着旧实例
watch(
	() => props.pod,
	(p) => {
		if (!p) visible.value = false;
	}
);

onBeforeUnmount(stopStream);
</script>

<style scoped>
.log-wrap {
	display: flex;
	flex-direction: column;
	height: 100%;
	gap: 8px;
}
.log-toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
}
.log-tip {
	font-size: 12px;
	color: #909399;
}
.log-box {
	flex: 1;
	min-height: 0;
	padding: 12px;
	overflow: auto;
	background: #1e1e1e;
	color: #d4d4d4;
	border-radius: 4px;
	pre {
		margin: 0;
		font-family: 'Menlo', 'Consolas', monospace;
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
	}
}
:deep(.el-drawer__body) {
	padding: 10px 14px 14px;
}
</style>
