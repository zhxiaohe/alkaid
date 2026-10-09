<template>
	<svg
		class="alkaid-logo"
		:viewBox="geo.viewBox"
		:width="width"
		:height="size"
		role="img"
		:aria-label="label"
	>
		<defs>
			<linearGradient
				:id="gid"
				:x1="geo.g[0]"
				:y1="geo.g[1]"
				:x2="geo.g[2]"
				:y2="geo.g[3]"
				gradientUnits="userSpaceOnUse"
			>
				<stop offset="0" class="alkaid-stop-0" />
				<stop offset="0.45" class="alkaid-stop-1" />
				<stop offset="1" class="alkaid-stop-2" />
			</linearGradient>
		</defs>

		<!-- ============ 字标：Alkaid 转曲轮廓 + 主副光轨 + 四芒星 ============ -->
		<template v-if="variant === 'wordmark'">
			<path class="alkaid-word" :d="WORD" />
			<path
				:d="TRAIL"
				fill="none"
				:stroke="`url(#${gid})`"
				stroke-width="5"
				stroke-linecap="round"
			/>
			<!-- 副光轨（速度线）：小于 26px 高自动省略，避免糊成一团 -->
			<path
				v-if="size >= 26"
				:d="SUB"
				fill="none"
				:stroke="`url(#${gid})`"
				stroke-width="2"
				stroke-linecap="round"
				opacity="0.35"
			/>
			<path class="alkaid-star" :d="STAR_WM" />
		</template>

		<!-- ============ 方形标：星 + 光轨（favicon / 品牌位） ============ -->
		<template v-else>
			<path
				v-if="geo.trail"
				:d="geo.trail"
				fill="none"
				:stroke="`url(#${gid})`"
				:stroke-width="geo.trailW"
				stroke-linecap="round"
			/>
			<path
				v-if="geo.sub && size >= 20"
				:d="geo.sub"
				fill="none"
				:stroke="`url(#${gid})`"
				:stroke-width="geo.subW"
				stroke-linecap="round"
				:opacity="geo.subOp"
			/>
			<path class="alkaid-star" :d="geo.star" />
		</template>
	</svg>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';

type Variant = 'wordmark' | 'mark' | 'star';

const props = withDefaults(
	defineProps<{
		/** wordmark = 字标（Alkaid + 主副光轨 + 星）；mark = 方形星标；star = 仅星体（侧栏折叠态 / 小尺寸） */
		variant?: Variant;
		/** 高度（px）；宽度按 variant 的宽高比自动推导 */
		size?: number;
		label?: string;
	}>(),
	{ variant: 'mark', size: 24, label: 'Alkaid 瑶光' },
);

// 每个实例一个渐变 id，避免同页多实例互相覆盖
const uid = getCurrentInstance()?.uid ?? Math.floor(Math.random() * 1e6);
const gid = `alkaid-trail-${uid}`;

/**
 * 字标主体：Space Grotesk SemiBold(600) · 50px · tracking -1.2 · 已转曲
 * 转曲原因：避免未装 Space Grotesk 的机器回落到 Helvetica/Arial，
 * 保证四主题、各端渲染完全一致（生产字体无需再引入 woff）。
 */
const WORD =
	'M14.99 68.00 24.58 33.00H35.07L44.66 68.00H38.46L36.37 60.02H23.28L21.18 68.00ZM24.71 54.48H34.93L30.25 36.76H29.40ZM48.11 68.00V33.00H53.83V68.00ZM59.96 68.00V33.00H65.68V52.66H66.53L75.47 43.29H83.01L71.04 55.26L83.41 68.00H75.96L66.53 57.96H65.68V68.00ZM94.31 68.70Q91.68 68.70 89.59 67.78Q87.49 66.87 86.27 65.11Q85.05 63.34 85.05 60.82Q85.05 58.29 86.27 56.58Q87.49 54.88 89.64 54.02Q91.80 53.16 94.54 53.16H101.71V51.66Q101.71 49.70 100.51 48.48Q99.30 47.27 96.75 47.27Q94.25 47.27 92.98 48.43Q91.70 49.59 91.30 51.46L86.00 49.70Q86.60 47.76 87.93 46.16Q89.25 44.55 91.46 43.57Q93.67 42.59 96.83 42.59Q101.68 42.59 104.48 45.03Q107.27 47.47 107.27 52.06V61.75Q107.27 63.25 108.67 63.25H110.73V68.00H106.70Q104.91 68.00 103.76 67.10Q102.61 66.19 102.61 64.67V64.57H101.74Q101.46 65.26 100.71 66.25Q99.95 67.23 98.42 67.97Q96.90 68.70 94.31 68.70ZM95.26 64.02Q98.12 64.02 99.91 62.40Q101.71 60.77 101.71 58.01V57.49H94.92Q93.03 57.49 91.90 58.31Q90.77 59.12 90.77 60.65Q90.77 62.17 91.95 63.10Q93.13 64.02 95.26 64.02ZM114.31 68.00V43.29H120.03V68.00ZM117.17 40.16Q115.57 40.16 114.47 39.12Q113.37 38.08 113.37 36.40Q113.37 34.72 114.47 33.68Q115.57 32.65 117.17 32.65Q118.81 32.65 119.89 33.68Q120.97 34.72 120.97 36.40Q120.97 38.08 119.89 39.12Q118.81 40.16 117.17 40.16ZM136.24 68.70Q133.24 68.70 130.65 67.22Q128.07 65.73 126.51 62.89Q124.96 60.04 124.96 56.03V55.26Q124.96 51.25 126.51 48.40Q128.06 45.55 130.63 44.07Q133.20 42.59 136.24 42.59Q138.57 42.59 140.16 43.15Q141.74 43.71 142.73 44.56Q143.72 45.42 144.24 46.38H145.09V33.00H150.81V68.00H145.19V64.75H144.34Q143.46 66.25 141.60 67.48Q139.75 68.70 136.24 68.70ZM137.93 63.69Q141.05 63.69 143.11 61.68Q145.17 59.67 145.17 55.88V55.40Q145.17 51.62 143.13 49.61Q141.09 47.60 137.93 47.60Q134.83 47.60 132.76 49.61Q130.70 51.62 130.70 55.40V55.88Q130.70 59.67 132.76 61.68Q134.83 63.69 137.93 63.69Z';
/**
 * 字标与星星的间距：原稿 'd' 墨迹右缘(x≈150.8) 到星左尖(x=222) 有 71 单位（≈2 个大写字高），
 * 视觉上断成两截。现把星整体左移 46，左侧留 25 单位（≈0.7 个大写字高）；光轨同步按 0.785 压缩收尾。
 */
const TRAIL = 'M14 92C64.2 91 120.8 87 182 76';
const SUB = 'M20.3 101C72.1 100 119.2 96 156.9 90';
const STAR_WM = 'M204 34Q211 55 232 62Q211 69 204 90Q197 69 176 62Q197 55 204 34Z';

const STAR = 'M32 10Q35 19 44 22Q35 25 32 34Q29 25 20 22Q29 19 32 10Z';

const GEO: Record<
	Variant,
	{
		viewBox: string;
		ratio: number; // 宽 / 高
		trail: string;
		trailW: number;
		sub: string;
		subW: number;
		subOp: number;
		star: string;
		g: number[];
	}
> = {
	// 字标：原稿 300×120 裁掉多余留白后的紧包围盒（内容 x 11.5~232 / y 32.65~102）
	wordmark: {
		viewBox: '8 29 227 76',
		ratio: 227 / 76,
		trail: TRAIL,
		trailW: 5,
		sub: SUB,
		subW: 2,
		subOp: 0.35,
		star: STAR_WM,
		g: [14, 92, 182, 76],
	},
	mark: {
		viewBox: '0 0 48 48',
		ratio: 1,
		trail: 'M3 34C11 32.5 18 29.5 25 25',
		trailW: 4.5,
		sub: 'M6 40C12 38.5 17 36 22 33',
		subW: 1.8,
		subOp: 0.4,
		star: STAR,
		g: [3, 34, 26, 24],
	},
	star: {
		viewBox: '0 0 48 48',
		ratio: 1,
		trail: '',
		trailW: 0,
		sub: '',
		subW: 0,
		subOp: 0,
		star: STAR,
		g: [3, 34, 26, 24],
	},
};

const geo = computed(() => GEO[props.variant]);
const width = computed(() => Math.round(props.size * geo.value.ratio * 100) / 100);
</script>

<style scoped lang="scss">
.alkaid-logo {
	display: block;
	flex-shrink: 0;
	overflow: visible;
}

/* 字标文字：默认走页面/卡片上的字色；深色容器（侧栏、Banner）由父级覆盖 --logo-word */
.alkaid-word {
	fill: var(--logo-word, var(--ink));
}

/* 光轨：青（--accent）→ 星色，起点全透明做锥形收束 */
.alkaid-stop-0 {
	stop-color: var(--accent, #06b6d4);
	stop-opacity: 0;
}
.alkaid-stop-1 {
	stop-color: var(--accent, #06b6d4);
	stop-opacity: 0.7;
}
.alkaid-stop-2 {
	stop-color: var(--logo-star, var(--brand));
	stop-opacity: 1;
}

/* 星体：默认取主品牌色，暗色主题用 --logo-star 提亮 */
.alkaid-star {
	fill: var(--logo-star, var(--brand));
}
</style>
