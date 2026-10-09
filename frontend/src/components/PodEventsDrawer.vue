<template>
	<el-drawer v-model="visible" :title="title" size="60%" @opened="load">
		<el-alert title="K8s 事件默认只保留最近 1 小时（event-ttl），请及时查看。" type="info" :closable="false" show-icon class="m-b-15" />
		<el-table :data="list" v-loading="loading" border stripe size="small">
			<el-table-column label="类型" width="100" align="center">
				<template #default="{ row }">
					<el-tag size="small" :type="row.type === 'Warning' ? 'warning' : 'info'" effect="light">{{ row.type || '-' }}</el-tag>
				</template>
			</el-table-column>
			<el-table-column label="原因" width="160" show-overflow-tooltip>
				<template #default="{ row }">{{ row.reason || '-' }}</template>
			</el-table-column>
			<el-table-column prop="message" label="内容" min-width="340" show-overflow-tooltip />
			<el-table-column prop="count" label="次数" width="70" align="center" />
			<el-table-column label="最后发生" width="175">
				<template #default="{ row }">{{ fmtTime(row.last_timestamp) }}</template>
			</el-table-column>
		</el-table>
		<el-empty v-if="!loading && list.length === 0" description="最近 1 小时内暂无事件" />
	</el-drawer>
</template>

<script setup lang="ts">
// PodEventsDrawer：实例事件（K8s Event 列表，参考 web-cloud EventDrawer 的列定义）
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import { getPodEvents, type ClusterPodItem, type PodEventItem } from '/@/api/cluster';

const props = defineProps<{ modelValue: boolean; pod: ClusterPodItem | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const visible = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});
const title = computed(() => (props.pod ? `事件 · ${props.pod.name}` : '事件'));

const loading = ref(false);
const list = ref<PodEventItem[]>([]);

const load = async () => {
	if (!props.pod) return;
	loading.value = true;
	try {
		const res: any = await getPodEvents(props.pod.name, { namespace: props.pod.namespace });
		list.value = res?.list ?? [];
	} catch {
		list.value = [];
	} finally {
		loading.value = false;
	}
};

const fmtTime = (t: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-');
</script>
