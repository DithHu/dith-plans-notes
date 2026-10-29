<template>
  <el-card class="page-card" shadow="never">
    <div class="toolbar">
      <el-input
        v-model="filters.q"
        placeholder="搜索标题或内容"
        clearable
        style="width: 220px"
        @keyup.enter="load"
      />
      <el-select v-model="filters.tag" placeholder="按标签筛选" clearable style="width: 160px">
        <el-option v-for="tag in tags" :key="tag.id" :label="tag.name" :value="tag.name" />
      </el-select>
      <el-select v-model="filters.completed" style="width: 120px">
        <el-option label="未完成" value="0" />
        <el-option label="已完成" value="1" />
        <el-option label="全部" value="all" />
      </el-select>
      <el-button type="primary" @click="search">搜索</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="openCreate">新建计划</el-button>
      <el-button @click="exportCsv">导出CSV</el-button>
      <el-button @click="triggerImport">导入CSV</el-button>
      <input ref="importInput" type="file" accept=".csv,text/csv" style="display: none" @change="onImportChange" />
    </div>

    <el-tabs v-model="viewMode" class="plan-tabs">
      <el-tab-pane label="Dashboard" name="dashboard">
        <div class="dashboard-row">
          <div class="quadrant-card">
            <div class="trend-header">
              <span class="trend-title">四象限</span>
            </div>
            <div class="quadrant-board">
              <div class="qb-corner"></div>
          <div class="qb-axis">紧急</div>
          <div class="qb-axis">不紧急</div>

          <div class="qb-axis qb-vertical">重要</div>
          <div
            v-for="quadrant in quadrants.slice(0, 2)"
            :key="quadrant.key"
            class="quadrant-panel"
            :class="`panel-${quadrant.key}`"
          >
            <div class="qp-header">
              <span>{{ quadrant.title }}</span>
              <el-tag size="small" :type="quadrant.tagType" effect="plain">{{ quadrant.items.length }}</el-tag>
            </div>
            <div v-if="!quadrant.items.length" class="qp-empty">暂无未完成计划</div>
            <ul v-else class="qp-list">
              <li v-for="plan in pagedItems(quadrant)" :key="plan.key" class="qp-item">
                <div class="qp-item-main">
                  <span class="qp-title">{{ plan.title || '无标题' }}</span>
                  <span class="qp-time">{{ formatTime(plan.dueTime || plan.createTime) }}</span>
                </div>
                <div class="qp-actions">
                  <el-button link type="primary" @click="openDetail(plan)">查看</el-button>
                  <el-button link type="success" @click="toggleComplete(plan)">完成</el-button>
                  <el-button link type="warning" @click="openSubPlans(plan)">查看子计划</el-button>
                </div>
              </li>
            </ul>
            <el-pagination
              v-if="quadrant.items.length > QUADRANT_PAGE_SIZE"
              size="small"
              background
              layout="prev, pager, next"
              :page-size="QUADRANT_PAGE_SIZE"
              :total="quadrant.items.length"
              :current-page="quadrantPages[quadrant.key] || 1"
              @current-change="(page) => (quadrantPages[quadrant.key] = page)"
            />
          </div>

          <div class="qb-axis qb-vertical">不重要</div>
          <div
            v-for="quadrant in quadrants.slice(2, 4)"
            :key="quadrant.key"
            class="quadrant-panel"
            :class="`panel-${quadrant.key}`"
          >
            <div class="qp-header">
              <span>{{ quadrant.title }}</span>
              <el-tag size="small" :type="quadrant.tagType" effect="plain">{{ quadrant.items.length }}</el-tag>
            </div>
            <div v-if="!quadrant.items.length" class="qp-empty">暂无未完成计划</div>
            <ul v-else class="qp-list">
              <li v-for="plan in pagedItems(quadrant)" :key="plan.key" class="qp-item">
                <div class="qp-item-main">
                  <span class="qp-title">{{ plan.title || '无标题' }}</span>
                  <span class="qp-time">{{ formatTime(plan.dueTime || plan.createTime) }}</span>
                </div>
                <div class="qp-actions">
                  <el-button link type="primary" @click="openDetail(plan)">查看</el-button>
                  <el-button link type="success" @click="toggleComplete(plan)">完成</el-button>
                  <el-button link type="warning" @click="openSubPlans(plan)">查看子计划</el-button>
                </div>
              </li>
            </ul>
            <el-pagination
              v-if="quadrant.items.length > QUADRANT_PAGE_SIZE"
              size="small"
              background
              layout="prev, pager, next"
              :page-size="QUADRANT_PAGE_SIZE"
              :total="quadrant.items.length"
              :current-page="quadrantPages[quadrant.key] || 1"
              @current-change="(page) => (quadrantPages[quadrant.key] = page)"
            />
          </div>
            </div>
          </div>

          <div class="trend-card">
            <div class="trend-header">
              <span class="trend-title">计划趋势</span>
            <el-radio-group v-model="granularity" size="small">
              <el-radio-button value="day">天</el-radio-button>
              <el-radio-button value="week">周</el-radio-button>
              <el-radio-button value="month">月</el-radio-button>
              <el-radio-button value="quarter">季度</el-radio-button>
              <el-radio-button value="year">年</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="chartRef" class="trend-chart"></div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="列表" name="list">
        <el-table :data="pagedTreeData" row-key="key" :tree-props="{ children: 'children' }" default-expand-all border>
          <el-table-column prop="title" label="标题" min-width="160" />
          <el-table-column label="内容" min-width="180">
            <template #default="{ row }">{{ (row.content || '').slice(0, 40) }}</template>
          </el-table-column>
          <el-table-column label="完成" width="100" align="center">
            <template #default="{ row }">
              <el-button
                :type="row.completed ? 'success' : 'primary'"
                size="small"
                plain
                @click="toggleComplete(row)"
              >
                {{ row.completed ? '已完成' : '未完成' }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="标记" width="130">
            <template #default="{ row }">
              <el-tag v-if="row.important" type="danger" size="small" style="margin-right: 4px">重要</el-tag>
              <el-tag v-if="row.urgent" type="warning" size="small">紧急</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="截止时间" width="160">
            <template #default="{ row }">{{ formatTime(row.dueTime) }}</template>
          </el-table-column>
          <el-table-column label="实际完成" width="160">
            <template #default="{ row }">{{ formatTime(row.actualTime) }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="150">
            <template #default="{ row }">
              <el-tag v-for="name in row.tags" :key="name" size="small" style="margin-right: 4px">{{ name }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="listPage"
            :page-size="LIST_PAGE_SIZE"
            :total="treeData.length"
            layout="total, prev, pager, next"
            background
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="editingKey ? '编辑计划' : '新建计划'" width="620px">
    <el-form :model="form" label-width="90px">
      <el-form-item label="标题">
        <el-input v-model="form.title" placeholder="请输入计划标题" />
      </el-form-item>
      <el-form-item label="内容">
        <el-input v-model="form.content" type="textarea" :rows="4" placeholder="请输入计划内容" />
      </el-form-item>
      <el-form-item label="截止时间">
        <el-date-picker
          v-model="form.dueTime"
          type="datetime"
          placeholder="选择截止时间"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="父计划">
        <el-select v-model="form.parentKey" placeholder="无父计划" clearable filterable style="width: 100%">
          <el-option v-for="plan in parentOptions" :key="plan.key" :label="plan.title || '(无标题)'" :value="plan.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入标签"
          style="width: 100%"
        >
          <el-option v-for="tag in tags" :key="tag.id" :label="tag.name" :value="tag.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="属性">
        <el-checkbox v-model="form.important">重要</el-checkbox>
        <el-checkbox v-model="form.urgent">紧急</el-checkbox>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="detailVisible" title="计划详情" width="560px">
    <el-descriptions v-if="detailPlan" :column="1" border>
      <el-descriptions-item label="标题">{{ detailPlan.title || '无标题' }}</el-descriptions-item>
      <el-descriptions-item label="内容">{{ detailPlan.content || '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ detailPlan.completed ? '已完成' : '未完成' }}</el-descriptions-item>
      <el-descriptions-item label="标记">
        <el-tag v-if="detailPlan.important" type="danger" size="small" style="margin-right: 4px">重要</el-tag>
        <el-tag v-if="detailPlan.urgent" type="warning" size="small">紧急</el-tag>
        <span v-if="!detailPlan.important && !detailPlan.urgent">-</span>
      </el-descriptions-item>
      <el-descriptions-item label="截止时间">{{ formatTime(detailPlan.dueTime) }}</el-descriptions-item>
      <el-descriptions-item label="实际完成">{{ formatTime(detailPlan.actualTime) }}</el-descriptions-item>
      <el-descriptions-item label="父计划">
        {{ detailPlan.parentKey ? parentTitle(detailPlan.parentKey) : '无' }}
      </el-descriptions-item>
      <el-descriptions-item label="标签">
        <el-tag v-for="name in detailPlan.tags" :key="name" size="small" style="margin-right: 4px">{{ name }}</el-tag>
        <span v-if="!detailPlan.tags || !detailPlan.tags.length">-</span>
      </el-descriptions-item>
    </el-descriptions>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="subDialogVisible" :title="`子计划 - ${subParentTitle}`" width="680px">
    <el-empty v-if="!subPlans.length" description="暂无子计划" :image-size="80" />
    <el-table v-else :data="subPlans" border size="small">
      <el-table-column label="标题" min-width="160">
        <template #default="{ row }">{{ row.title || '无标题' }}</template>
      </el-table-column>
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.dueTime || row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.completed ? 'success' : 'info'" size="small">
            {{ row.completed ? '已完成' : '未完成' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">查看详情</el-button>
          <el-button v-if="!row.completed" link type="success" @click="toggleComplete(row)">完成</el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="subDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import api from '../api'
import { downloadCsv, errorMessage, formatTime, parseCsvObjects } from '../utils'

const LIST_PAGE_SIZE = 10
const QUADRANT_PAGE_SIZE = 5

function emptyForm() {
  return {
    title: '',
    content: '',
    dueTime: null,
    important: false,
    urgent: false,
    parentKey: null,
    tags: [],
  }
}

const plans = ref([])
const tags = ref([])
// completed: '0'=未完成（默认），'1'=已完成，'all'=全部
const filters = reactive({ q: '', tag: '', completed: '0' })
const viewMode = ref('dashboard')
const dialogVisible = ref(false)
const saving = ref(false)
const editingKey = ref(null)
const form = reactive(emptyForm())

const detailVisible = ref(false)
const detailPlan = ref(null)
const subDialogVisible = ref(false)
const subParentKey = ref(null)
const subParentTitle = ref('')
const listPage = ref(1)
const quadrantPages = reactive({})
const importInput = ref(null)

// 列表页按状态筛选（仅影响“列表”Tab，Dashboard 仍使用全量数据）
const listPlans = computed(() => {
  if (filters.completed === 'all') return plans.value
  const wantCompleted = filters.completed === '1'
  return plans.value.filter((plan) => !!plan.completed === wantCompleted)
})

const treeData = computed(() => {
  const map = new Map()
  const roots = []
  listPlans.value.forEach((plan) => map.set(plan.key, { ...plan, children: [] }))
  listPlans.value.forEach((plan) => {
    const node = map.get(plan.key)
    const parent = plan.parentKey ? map.get(plan.parentKey) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
})

const pagedTreeData = computed(() => {
  const maxPage = Math.max(1, Math.ceil(treeData.value.length / LIST_PAGE_SIZE))
  const page = Math.min(Math.max(1, listPage.value), maxPage)
  return treeData.value.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE)
})

function pagedItems(quadrant) {
  const page = quadrantPages[quadrant.key] || 1
  return quadrant.items.slice((page - 1) * QUADRANT_PAGE_SIZE, page * QUADRANT_PAGE_SIZE)
}

const parentOptions = computed(() => {
  if (!editingKey.value) return plans.value
  const excluded = new Set([editingKey.value])
  let changed = true
  while (changed) {
    changed = false
    for (const plan of plans.value) {
      if (plan.parentKey && excluded.has(plan.parentKey) && !excluded.has(plan.key)) {
        excluded.add(plan.key)
        changed = true
      }
    }
  }
  return plans.value.filter((plan) => !excluded.has(plan.key))
})

const quadrants = computed(() => {
  const definitions = [
    { key: 'urgent-important', title: '重要且紧急', important: true, urgent: true, tagType: 'danger' },
    { key: 'normal-important', title: '重要不紧急', important: true, urgent: false, tagType: 'warning' },
    { key: 'urgent-unimportant', title: '不重要但紧急', important: false, urgent: true, tagType: 'primary' },
    { key: 'normal-unimportant', title: '不重要不紧急', important: false, urgent: false, tagType: 'info' },
  ]
  return definitions.map((definition) => ({
    ...definition,
    items: plans.value.filter(
      (plan) =>
        !plan.completed &&
        !!plan.important === definition.important &&
        !!plan.urgent === definition.urgent,
    ),
  }))
})

const subPlans = computed(() => {
  if (!subParentKey.value) return []
  return plans.value.filter((plan) => plan.parentKey === subParentKey.value)
})

const granularity = ref('day')
const chartRef = ref(null)
let chart = null

function pad(value) {
  return String(value).padStart(2, '0')
}

function bucketStart(timestamp, unit) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  if (unit === 'week') {
    const weekday = date.getDay()
    date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1))
  } else if (unit === 'month') {
    date.setDate(1)
  } else if (unit === 'quarter') {
    date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1)
  } else if (unit === 'year') {
    date.setMonth(0, 1)
  }
  return date.getTime()
}

function nextBucket(timestamp, unit) {
  const date = new Date(timestamp)
  if (unit === 'day') date.setDate(date.getDate() + 1)
  else if (unit === 'week') date.setDate(date.getDate() + 7)
  else if (unit === 'month') date.setMonth(date.getMonth() + 1)
  else if (unit === 'quarter') date.setMonth(date.getMonth() + 3)
  else date.setFullYear(date.getFullYear() + 1)
  return date.getTime()
}

function bucketLabel(timestamp, unit) {
  const date = new Date(timestamp)
  if (unit === 'day') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (unit === 'week') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (unit === 'month') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
  if (unit === 'quarter') return `${date.getFullYear()}Q${Math.floor(date.getMonth() / 3) + 1}`
  return `${date.getFullYear()}`
}

function countByBucket(items, getTime, bucketMap) {
  items.forEach((item) => {
    const time = getTime(item)
    if (!time) return
    const bucket = bucketStart(time, granularity.value)
    bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1)
  })
}

const trendData = computed(() => {
  const unit = granularity.value
  const completedPlans = plans.value.filter((plan) => plan.completed)
  const unfinishedPlans = plans.value.filter((plan) => !plan.completed)
  const completedMap = new Map()
  const unfinishedMap = new Map()
  countByBucket(completedPlans, (plan) => plan.actualTime || plan.createTime, completedMap)
  countByBucket(unfinishedPlans, (plan) => plan.createTime, unfinishedMap)

  const times = [
    ...completedPlans.map((plan) => plan.actualTime || plan.createTime),
    ...unfinishedPlans.map((plan) => plan.createTime),
  ].filter(Boolean)
  if (!times.length) return { labels: [], completed: [], unfinished: [] }

  const start = bucketStart(Math.min(...times), unit)
  const end = bucketStart(Math.max(Date.now(), ...times), unit)
  const labels = []
  const completed = []
  const unfinished = []
  for (let cursor = start; cursor <= end && labels.length < 400; cursor = nextBucket(cursor, unit)) {
    labels.push(bucketLabel(cursor, unit))
    completed.push(completedMap.get(cursor) || 0)
    unfinished.push(unfinishedMap.get(cursor) || 0)
  }
  return { labels, completed, unfinished }
})

function renderChart() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  const { labels, completed, unfinished } = trendData.value
  chart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        formatter(params) {
          const lines = params.map((item) => `${item.marker}${item.seriesName}：${item.value}`)
          return `${params[0].axisValue}<br/>${lines.join('<br/>')}`
        },
      },
      legend: { data: ['已完成', '未完成'], top: 0 },
      grid: { left: 48, right: 24, top: 36, bottom: 32 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLabel: { hideOverlap: true },
      },
      yAxis: { type: 'value', name: '数量', minInterval: 1 },
      series: [
        {
          name: '已完成',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          data: completed,
          lineStyle: { color: '#67c23a' },
          itemStyle: { color: '#67c23a' },
        },
        {
          name: '未完成',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          data: unfinished,
          lineStyle: { color: '#f56c6c' },
          itemStyle: { color: '#f56c6c' },
        },
      ],
    },
    true,
  )
}

function handleResize() {
  if (chart) chart.resize()
}

watch(granularity, () => {
  renderChart()
})

watch(
  trendData,
  () => {
    if (viewMode.value === 'dashboard') renderChart()
  },
)

watch(viewMode, (mode) => {
  if (mode === 'dashboard') {
    nextTick(() => {
      if (chart) chart.resize()
      renderChart()
    })
  }
})

async function load() {
  const params = {}
  if (filters.q) params.q = filters.q
  if (filters.tag) params.tag = filters.tag
  try {
    const { data } = await api.get('/plans', { params })
    plans.value = data
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function loadTags() {
  try {
    const { data } = await api.get('/tags')
    tags.value = data
  } catch (error) {
    tags.value = []
  }
}

async function resetFilters() {
  try {
    await ElMessageBox.confirm('确定要重置筛选条件吗？', '提示', { type: 'warning' })
  } catch (error) {
    return
  }
  filters.q = ''
  filters.tag = ''
  filters.completed = '0'
  listPage.value = 1
  load()
}

function search() {
  listPage.value = 1
  load()
}

function openCreate() {
  Object.assign(form, emptyForm())
  editingKey.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  Object.assign(form, {
    title: row.title,
    content: row.content,
    dueTime: row.dueTime ? new Date(row.dueTime) : null,
    important: !!row.important,
    urgent: !!row.urgent,
    parentKey: row.parentKey || null,
    tags: [...row.tags],
  })
  editingKey.value = row.key
  dialogVisible.value = true
}

function openDetail(plan) {
  detailPlan.value = plan
  detailVisible.value = true
}

function openSubPlans(plan) {
  subParentKey.value = plan.key
  subParentTitle.value = plan.title || '无标题'
  subDialogVisible.value = true
}

function parentTitle(parentKey) {
  const parent = plans.value.find((plan) => plan.key === parentKey)
  return parent ? parent.title || '无标题' : '未知计划'
}

async function submit() {
  saving.value = true
  try {
    const payload = {
      title: form.title,
      content: form.content,
      dueTime: form.dueTime ? new Date(form.dueTime).getTime() : null,
      important: form.important,
      urgent: form.urgent,
      parentKey: form.parentKey || null,
      tags: form.tags,
    }
    if (editingKey.value) {
      const [createTime, id] = editingKey.value.split(':')
      await api.put(`/plans/${createTime}/${id}`, payload)
    } else {
      await api.post('/plans', payload)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await load()
    await loadTags()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function toggleComplete(row) {
  const completed = !row.completed
  try {
    const [createTime, id] = row.key.split(':')
    await api.put(`/plans/${createTime}/${id}`, {
      completed,
      actualTime: completed ? Date.now() : null,
    })
    ElMessage.success(completed ? '已标记完成' : '已取消完成')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
    await load()
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除计划「${row.title || '无标题'}」吗？`, '提示', { type: 'warning' })
  } catch (error) {
    return
  }
  try {
    const [createTime, id] = row.key.split(':')
    await api.delete(`/plans/${createTime}/${id}`)
    ElMessage.success('已删除')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function triggerImport() {
  if (importInput.value) importInput.value.click()
}

function onImportChange(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      await applyImport(String(reader.result))
    } catch (error) {
      ElMessage.error(errorMessage(error))
    } finally {
      event.target.value = ''
    }
  }
  reader.readAsText(file, 'utf-8')
}

function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isTruthy(value) {
  const text = String(value).trim().toLowerCase()
  return text === '1' || text === 'true'
}

function splitTags(value) {
  return String(value || '')
    .split('|')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

async function exportCsv() {
  try {
    const { data } = await api.get('/plans')
    const rows = [
      [
        'key',
        'createTime',
        'id',
        'title',
        'content',
        'dueTime',
        'actualTime',
        'completed',
        'important',
        'urgent',
        'parentKey',
        'tags',
        'updateTime',
      ],
      ...data.map((plan) => [
        plan.key,
        plan.createTime,
        plan.id,
        plan.title,
        plan.content,
        plan.dueTime ?? '',
        plan.actualTime ?? '',
        plan.completed ? 1 : 0,
        plan.important ? 1 : 0,
        plan.urgent ? 1 : 0,
        plan.parentKey ?? '',
        (plan.tags || []).join('|'),
        plan.updateTime,
      ]),
    ]
    downloadCsv(`plans-${Date.now()}.csv`, rows)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function applyImport(text) {
  const records = parseCsvObjects(text)
    .map((record) => {
      const createTime = Number(record.createTime)
      const id = Number(record.id)
      if (!createTime || !id) return null
      return {
        createTime,
        id,
        title: record.title || '',
        content: record.content || '',
        dueTime: toNullableNumber(record.dueTime),
        actualTime: toNullableNumber(record.actualTime),
        completed: isTruthy(record.completed),
        important: isTruthy(record.important),
        urgent: isTruthy(record.urgent),
        parentKey: record.parentKey || null,
        tags: splitTags(record.tags),
        updateTime: toNullableNumber(record.updateTime) || createTime,
      }
    })
    .filter(Boolean)
  if (!records.length) {
    ElMessage.warning('CSV 中没有可导入的计划数据')
    return
  }
  const { data } = await api.post('/plans/import', { plans: records })
  ElMessage.success(`导入完成：写入/更新 ${data.count} 条，跳过 ${data.total - data.count} 条`)
  listPage.value = 1
  await load()
  await loadTags()
}

watch(
  () => filters.completed,
  () => {
    listPage.value = 1
  },
)

watch(
  () => treeData.value.length,
  (length) => {
    const maxPage = Math.max(1, Math.ceil(length / LIST_PAGE_SIZE))
    if (listPage.value > maxPage) listPage.value = maxPage
  },
)

watch(quadrants, (list) => {
  for (const quadrant of list) {
    const maxPage = Math.max(1, Math.ceil(quadrant.items.length / QUADRANT_PAGE_SIZE))
    if ((quadrantPages[quadrant.key] || 1) > maxPage) quadrantPages[quadrant.key] = maxPage
  }
})

onMounted(() => {
  load()
  loadTags()
  window.addEventListener('resize', handleResize)
  nextTick(() => renderChart())
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped>
.plan-tabs {
  margin-top: 16px;
}

.dashboard-row {
  display: flex;
  gap: 16px;
  align-items: stretch;
  margin-bottom: 20px;
}

.quadrant-card {
  flex: 1.6;
  min-width: 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
}

.quadrant-board {
  display: grid;
  grid-template-columns: 60px 1fr 1fr;
  grid-template-rows: 32px minmax(180px, auto) minmax(180px, auto);
  gap: 10px;
}

.qb-axis {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #909399;
}

.qb-vertical {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.qb-corner {
  background: transparent;
}

.quadrant-panel {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.panel-urgent-important {
  background: #fef0f0;
}

.panel-normal-important {
  background: #fdf6ec;
}

.panel-urgent-unimportant {
  background: #ecf5ff;
}

.panel-normal-unimportant {
  background: #f4f4f5;
}

.qp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.qp-empty {
  color: #b1b3b8;
  font-size: 13px;
  padding: 12px 0;
}

.qp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  max-height: 320px;
}

.qp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
}

.qp-item:last-child {
  border-bottom: none;
}

.qp-item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.qp-title {
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qp-time {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.qp-actions {
  display: flex;
  flex-shrink: 0;
}

.trend-card {
  flex: 1;
  min-width: 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
}

.trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.trend-title {
  font-size: 15px;
  font-weight: 600;
}

.trend-chart {
  width: 100%;
  height: 360px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.quadrant-panel :deep(.el-pagination) {
  margin-top: auto;
  padding-top: 8px;
  justify-content: center;
}
</style>
