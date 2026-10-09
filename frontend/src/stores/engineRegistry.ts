import { defineStore } from 'pinia';
import { getEngineImages, getEnvImages, type EngineImage, type EngineImageEnv, type ParamField } from '/@/api/engine';

// 引擎镜像注册表（前端缓存）
//
// 为什么要 store 而不是各页面各拉一次：创建抽屉里 engineOptions / selectedEngine / activeSchema
// 都是**同步 computed**（表单默认值、校验规则、模板渲染都依赖它们），
// 换成接口后必须有"打开抽屉前已加载完"的确定性。做法：单例 Promise（ensureLoaded）+
// 模块级缓存，打开抽屉前 await 一次；并发调用复用同一个请求（与 api/dict.ts 的 getDictOptions 同思路）。
//
// 旧实现是模块级常量（views/inference/engine-registry.ts），已删除 —— 权威源在后端注册表。

let inflight: Promise<void> | null = null;

export const useEngineRegistryStore = defineStore('engineRegistry', {
	state: () => ({
		images: [] as EngineImage[],
		// 环境级覆盖：同一条注册表行在不同环境可用不同镜像地址（key = engine_image_id）
		envImages: {} as Record<number, EngineImageEnv[]>,
		loading: false,
		error: '' as string,
	}),
	getters: {
		// 启用中的镜像行（只有这些可选；下架行仍会在详情页回显，见 byId）
		active: (s) => s.images.filter((r) => r.status),
		// 已开放的平台坐标（去重，按注册表出现顺序）
		platforms: (s) => Array.from(new Set(s.images.map((r) => r.platform))),
		firstActive: (s) => s.images.find((r) => r.status) || null,
	},
	actions: {
		byId(id: number | string | undefined | null): EngineImage | null {
			const n = Number(id);
			if (!n) return null;
			return this.images.find((r) => r.id === n) || null;
		},
		// 某平台下的可选镜像（创建页下拉）
		optionsFor(platform: string): EngineImage[] {
			return this.active.filter((r) => r.platform === platform);
		},
		// 镜像行的参数 schema（空数组=该引擎无可调参数，不再回退前端常量）
		schemaOf(row: EngineImage | null): ParamField[] {
			return row?.param_schema || [];
		},
		// 展示坐标：注册表找不到时回退空串（详情页旧记录容错）
		displayById(id: number | string | undefined | null): string {
			return this.byId(id)?.display || '';
		},
		// 某镜像行在某环境的覆盖地址（无覆盖返回 null）
		envOverride(imageID: number | null | undefined, envID: number | null | undefined): EngineImageEnv | null {
			const imgID = Number(imageID);
			const eID = Number(envID);
			if (!imgID || !eID) return null;
			return (this.envImages[imgID] || []).find((r) => r.env_id === eID) || null;
		},
		/**
		 * 实际下发的镜像地址：环境覆盖优先，未配置回退注册表默认值。
		 *
		 * 这是创建页展示与 buildSpec 的唯一取值口径 —— 必须与后端
		 * resolveAndRender（先查 engine_image_env 再回退 engine_image.image）保持一致，
		 * 否则会出现"页面显示 A、真正下发 B"（差异只在渲染后的 Deployment 里能看到）。
		 */
		effectiveImage(row: EngineImage | null | undefined, envID: number | null | undefined): string {
			if (!row) return '';
			return this.envOverride(row.id, envID)?.image || row.image;
		},
		// 管理页保存覆盖后同步本地缓存，避免为一个环境再拉全表
		upsertEnvLocal(row: EngineImageEnv) {
			const list = this.envImages[row.engine_image_id] || [];
			const idx = list.findIndex((r) => r.env_id === row.env_id);
			if (idx >= 0) list[idx] = { ...list[idx], ...row };
			else list.push(row);
			this.envImages = { ...this.envImages, [row.engine_image_id]: list };
		},
		removeEnvLocal(imageID: number, envID: number) {
			const list = this.envImages[imageID] || [];
			this.envImages = { ...this.envImages, [imageID]: list.filter((r) => r.env_id !== envID) };
		},
		/**
		 * 拉取注册表 + 环境覆盖（带并发去重与缓存）。
		 *
		 * 两次请求一起发：创建页展示"当前环境实际下发的镜像"必须同时有注册表行和环境覆盖，
		 * 只加载一半会出现"先按默认值渲染、覆盖到了再跳一下"的闪烁。
		 * @param force 管理页改动后需要强制刷新时传 true
		 */
		async ensureLoaded(force = false): Promise<void> {
			if (!force && this.images.length) return;
			if (inflight) return inflight;
			this.loading = true;
			inflight = (async () => {
				try {
					const [images, envRows] = await Promise.all([
						getEngineImages(),
						// 覆盖拉取失败不该拖垮注册表本身：catch 后按"无覆盖"降级
						getEnvImages().catch(() => [] as EngineImageEnv[]),
					]);
					this.images = Array.isArray(images) ? (images as unknown as EngineImage[]) : [];
					const grouped: Record<number, EngineImageEnv[]> = {};
					for (const r of Array.isArray(envRows) ? envRows : []) {
						(grouped[r.engine_image_id] ||= []).push(r);
					}
					this.envImages = grouped;
					this.error = '';
				} catch {
					// 拦截器已提示；这里只记录，调用方按"注册表为空"降级（必填校验会兜底拦住提交）
					this.error = '引擎注册表加载失败';
				} finally {
					this.loading = false;
					inflight = null;
				}
			})();
			return inflight;
		},
		// 管理页保存后同步本地缓存，避免为了一个字段再拉一次全表
		upsertLocal(row: EngineImage) {
			const idx = this.images.findIndex((r) => r.id === row.id);
			if (idx >= 0) this.images[idx] = { ...this.images[idx], ...row };
			else this.images.push(row);
		},
		removeLocal(id: number) {
			this.images = this.images.filter((r) => r.id !== id);
			// 连带清理环境覆盖缓存，否则残留行会在下次渲染时把已删镜像的地址当成有效覆盖
			const rest = { ...this.envImages };
			delete rest[id];
			this.envImages = rest;
		},
	},
});
