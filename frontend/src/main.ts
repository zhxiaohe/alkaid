import { createApp } from 'vue';
import App from './App.vue';
import router from '/@/router';
import pinia from '/@/stores';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
// Element Plus 暗色变量兜底（html.dark），配合 tokens.scss 的 --el-* 覆盖
import 'element-plus/theme-chalk/dark/css-vars.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import '/@/styles/index.scss';
import { useThemeStore } from '/@/stores/theme';

const app = createApp(App);

// 全局注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
	app.component(key, component);
}

app.use(ElementPlus).use(pinia).use(router);

// 启动时恢复用户主题（light=晴界 / dark=玄夜）
useThemeStore().init();

app.mount('#app');
