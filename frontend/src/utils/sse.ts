// SSE 流式消费工具（fetch + ReadableStream 实现）
//
// 不用原生 EventSource：它无法携带 Authorization / X-ENV-ID 两个鉴权头（本平台所有
// 业务接口都依赖），也不支持自定义错误处理与主动中止。fetch 方案与 axios 侧保持
// 同一套鉴权、环境隔离与会话失效语义；后续 playground 流式对话可直接复用本工具。
import { ElMessageBox } from 'element-plus';
import { Session } from '/@/utils/storage';
import { getEnvIdHeader } from '/@/api/request';

export interface SSEHandlers {
	/** 普通 data 帧（日志行 / 流式文本片段） */
	onMessage: (data: string) => void;
	/** 服务端 `event: end` —— 流正常结束 */
	onEnd?: (reason: string) => void;
	/** 建连失败或流中 `event: error` */
	onError?: (message: string) => void;
}

// 会话失效处理与 axios 响应拦截器保持一致：清会话 → 提示 → 跳登录
function handleSessionExpired(): void {
	Session.clear();
	ElMessageBox.alert('登录已失效，请重新登录', '提示', {}).then(() => {
		window.location.href = '/login';
	});
}

function buildQuery(params?: Record<string, unknown>): string {
	if (!params) return '';
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null || v === '') continue;
		qs.append(k, String(v));
	}
	const s = qs.toString();
	return s ? `?${s}` : '';
}

// 单帧解析：逐行取 event:/data: 字段；`:` 开头的注释帧（心跳）直接忽略
function parseFrame(frame: string): { event: string; data: string } | null {
	let event = '';
	const dataLines: string[] = [];
	for (const raw of frame.split('\n')) {
		const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		if (!line || line.startsWith(':')) continue;
		if (line.startsWith('event:')) event = line.slice(6).trim();
		else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
	}
	if (!event && !dataLines.length) return null;
	return { event, data: dataLines.join('\n') };
}

interface SSEFrameParser {
	push: (frame: string) => void;
	flush: () => void;
}

// 帧分发器：跟踪 end/error 已处理标记，避免流关闭时重复触发收尾回调
function makeFrameParser(handlers: SSEHandlers, isStale: () => boolean): SSEFrameParser {
	let finished = false;
	const push = (frame: string) => {
		const parsed = parseFrame(frame);
		if (!parsed || isStale()) return;
		if (parsed.event === 'end') {
			finished = true;
			handlers.onEnd?.(parsed.data || 'stream closed');
		} else if (parsed.event === 'error') {
			finished = true;
			handlers.onError?.(parsed.data || '流异常结束');
		} else {
			handlers.onMessage(parsed.data);
		}
	};
	const flush = () => {
		if (!finished && !isStale()) handlers.onEnd?.('stream closed');
	};
	return { push, flush };
}

/**
 * 发起一次 GET SSE 请求并持续消费，直到流结束 / 出错 / 被 signal 中止。
 * 注意：本函数不 throw——所有失败都走 onError；主动 abort 静默返回。
 */
export async function streamRequest(
	path: string,
	params: Record<string, unknown>,
	handlers: SSEHandlers,
	signal: AbortSignal
): Promise<void> {
	let res: Response;
	try {
		const envId = getEnvIdHeader();
		res = await fetch(`/api${path}${buildQuery(params)}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${Session.get('token') || ''}`,
				...(envId ? { 'X-ENV-ID': envId } : {}),
			},
			signal,
		});
	} catch (e: any) {
		if (e?.name !== 'AbortError') handlers.onError?.('网络连接失败');
		return;
	}

	// 非流式响应 = 建流前校验失败，后端返回统一 JSON 错误体（code/message 语义同 axios 拦截器）
	if (!res.ok || !(res.headers.get('Content-Type') || '').includes('text/event-stream')) {
		try {
			const body = await res.json();
			if ([30001, 30002].includes(body?.code)) {
				handleSessionExpired();
				return;
			}
			handlers.onError?.(body?.message || `流式请求失败（HTTP ${res.status}）`);
		} catch {
			handlers.onError?.(`流式请求失败（HTTP ${res.status}）`);
		}
		return;
	}
	if (!res.body) {
		handlers.onError?.('当前浏览器不支持流式响应');
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder('utf-8');
	const parser = makeFrameParser(handlers, () => signal.aborted);
	let buffer = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let idx: number;
			while ((idx = buffer.indexOf('\n\n')) >= 0) {
				parser.push(buffer.slice(0, idx));
				buffer = buffer.slice(idx + 2);
			}
		}
		// 服务端帧均以 \n\n 结尾；缓冲里若还有未终止内容则按末帧兜底处理
		if (buffer.trim()) parser.push(buffer);
		parser.flush();
	} catch (e: any) {
		if (e?.name !== 'AbortError') handlers.onError?.('流读取中断');
	} finally {
		reader.releaseLock();
	}
}
