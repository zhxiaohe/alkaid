<template>
	<el-drawer v-model="visible" :title="title" size="70%" :with-header="true" class="pod-terminal-drawer" @opened="onOpened" @closed="dispose">
		<div class="terminal-wrap">
			<div class="terminal-toolbar">
				<el-tag size="small" :type="statusType" effect="light">{{ statusText }}</el-tag>
				<span v-if="pod" class="text-muted" style="font-size: 12px">{{ pod.namespace }} / {{ pod.name }}</span>
				<div style="flex: 1" />
				<el-button size="small" :disabled="status === 'connected' || status === 'connecting'" @click="reconnect">重新连接</el-button>
				<el-button size="small" @click="clearScreen">清屏</el-button>
			</div>
			<div ref="termRef" class="terminal-box" />
		</div>
	</el-drawer>
</template>

<script setup lang="ts">
// PodTerminalDrawer：实例 Web 终端（xterm + WebSocket + SPDY exec）。
// 参考 web-cloud PodTerminalDrawer：消息协议 {type:input/resize/ping}，输出为纯文本。
// WS 无法携带请求头，token/env_id 走后端中间件的 query 降级；会话录像由后端 terminal 配置控制。
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { buildPodTerminalWsUrl, type ClusterPodItem } from '/@/api/cluster';

const props = defineProps<{ modelValue: boolean; pod: ClusterPodItem | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});
const title = computed(() => (props.pod ? `终端 · ${props.pod.name}` : '终端'));

type TermStatus = 'idle' | 'connecting' | 'connected' | 'closed';
const status = ref<TermStatus>('idle');
const statusText = computed(() => ({ idle: '未连接', connecting: '连接中…', connected: '已连接', closed: '已断开' })[status.value]);
const statusType = computed(() => ({ idle: 'info', connecting: 'warning', connected: 'success', closed: 'danger' } as const)[status.value]);

const termRef = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let pingTimer: number | undefined;
let dataDisposable: { dispose: () => void } | null = null;

const initTerminal = () => {
	if (term || !termRef.value) return;
	term = new Terminal({
		cursorBlink: true,
		convertEol: true,
		scrollback: 100000,
		fontSize: 14,
		fontFamily: 'Menlo, Monaco, "Courier New", monospace',
		theme: { foreground: '#e6e6e6', background: '#181e29' },
	});
	fitAddon = new FitAddon();
	term.loadAddon(fitAddon);
	term.loadAddon(new WebLinksAddon());
	try {
		term.loadAddon(new WebglAddon()); // WebGL 不可用时自动退化为内置渲染器
	} catch {
		/* ignore */
	}
	term.open(termRef.value);
	fitAddon.fit();
};

const clearTimers = () => {
	if (pingTimer !== undefined) {
		window.clearInterval(pingTimer);
		pingTimer = undefined;
	}
};

// 关闭旧连接并摘除回调（重连/关闭时复用；置空回调避免旧 socket 触发状态回写）
const closeWs = () => {
	clearTimers();
	if (ws) {
		const old = ws;
		ws = null;
		old.onopen = old.onmessage = old.onclose = old.onerror = null;
		try {
			old.close();
		} catch {
			/* ignore */
		}
	}
};

const sendResize = () => {
	if (ws?.readyState === WebSocket.OPEN && term) {
		ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
	}
};

const connect = () => {
	if (!props.pod || !term) return;
	closeWs();
	status.value = 'connecting';
	term.writeln('\x1b[90mConnecting...\x1b[0m');
	const socket = new WebSocket(buildPodTerminalWsUrl(props.pod.name, { namespace: props.pod.namespace }));
	ws = socket;

	socket.onopen = () => {
		if (ws !== socket) return;
		status.value = 'connected';
		fitAddon?.fit();
		sendResize();
		dataDisposable?.dispose();
		dataDisposable = term!.onData((input) => {
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', input }));
		});
		// 10s 心跳：保活 + 让服务端尽早感知半开连接
		pingTimer = window.setInterval(() => {
			if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
		}, 10000);
	};
	socket.onmessage = (e) => {
		if (ws === socket) term?.write(typeof e.data === 'string' ? e.data : '');
	};
	socket.onclose = () => {
		if (ws !== socket) return;
		clearTimers();
		status.value = 'closed';
		term?.writeln('\x1b[90m[连接已关闭，可点击「重新连接」]\x1b[0m');
	};
	socket.onerror = () => {
		if (ws === socket) status.value = 'closed';
	};
};

const onOpened = () => {
	initTerminal();
	fitAddon?.fit();
	connect();
};

const reconnect = () => {
	term?.clear();
	connect();
};

const clearScreen = () => term?.clear();

// 窗口尺寸变化：fit 后同步新行列给远端 pty
const onWindowResize = () => {
	if (!props.modelValue) return;
	fitAddon?.fit();
	sendResize();
};
window.addEventListener('resize', onWindowResize);

const dispose = () => {
	closeWs();
	dataDisposable?.dispose();
	dataDisposable = null;
	term?.dispose();
	term = null;
	fitAddon = null;
	status.value = 'idle';
};

// 外部把 pod 置空（如切环境）时，关闭当前会话避免连到旧实例
watch(() => props.pod, (p) => {
	if (!p) visible.value = false;
});

onBeforeUnmount(() => {
	window.removeEventListener('resize', onWindowResize);
	dispose();
});
</script>

<style scoped>
.terminal-wrap {
	display: flex;
	flex-direction: column;
	height: 100%;
	gap: 8px;
}
.terminal-toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
}
.terminal-box {
	flex: 1;
	min-height: 0;
	background: #181e29;
	border-radius: 4px;
	padding: 6px 8px;
	overflow: hidden;
}
:deep(.el-drawer__body) {
	padding: 10px 14px 14px;
}
</style>
