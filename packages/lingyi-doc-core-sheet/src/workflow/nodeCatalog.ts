/**
 * 工作流节点类型目录
 * 定义所有可用节点的元信息（名称、图标、颜色、默认配置等）
 */
import type { WorkflowNodeType } from './types';
import { getIfElseDefaultConfig, getSwitchDefaultConfig, IF_ELSE_BRANCH_PORTS } from './nodeConfig';

export interface NodeTypeMeta {
  type: WorkflowNodeType;
  label: string;
  category: 'common' | 'feishu' | 'dingtalk' | 'ai' | 'shortcut';
  icon: string;
  color: string;
  description?: string;
  defaultConfig?: Record<string, unknown>;
  branches?: Array<{ key: string; label: string }>;
  /** 触发器分组（仅 trigger 节点）：table / todo / tool */
  triggerGroup?: 'table' | 'todo' | 'tool';
}

/** 触发器分组（按产品语义划分，展示顺序固定） */
export const TRIGGER_GROUPS: Array<{ key: 'table' | 'todo' | 'tool'; title: string }> = [
  { key: 'table', title: 'AI 表格' },
  { key: 'todo', title: '待办' },
  { key: 'tool', title: '内置工具' },
];

export const NODE_TYPE_CATALOG: NodeTypeMeta[] = [
  // 触发器
  {
    type: 'trigger.record_added',
    label: '创建记录时',
    category: 'common',
    icon: '\u2795',
    color: '#ff7a45',
    description: '数据表中新增一条记录时触发',
    triggerGroup: 'table',
    defaultConfig: { conditions: { op: 'and', conditions: [] } },
  },
  {
    type: 'trigger.record_updated',
    label: '记录变更时',
    category: 'common',
    icon: '\u270F\uFE0F',
    color: '#ff7a45',
    description: '数据表中记录被修改时触发',
    triggerGroup: 'table',
    defaultConfig: { conditions: { op: 'and', conditions: [] } },
  },
  {
    type: 'trigger.record_match',
    label: '新增或修改的记录满足条件时',
    category: 'common',
    icon: '\uD83C\uDFAF',
    color: '#ff7a45',
    description: '记录变更且满足筛选条件时触发',
    triggerGroup: 'table',
    defaultConfig: { conditions: { op: 'and', conditions: [] } },
  },
  {
    type: 'trigger.record_deleted',
    label: '删除记录时',
    category: 'common',
    icon: '🗑️',
    color: '#ff7a45',
    description: '数据表中记录被删除时触发',
    triggerGroup: 'table',
    defaultConfig: { conditions: { op: 'and', conditions: [] } },
  },
  {
    type: 'trigger.record_datetime',
    label: '到达记录中的时间时',
    category: 'common',
    icon: '📅',
    color: '#ff7a45',
    description: '到达指定日期时间字段的值时触发',
    triggerGroup: 'table',
    defaultConfig: {},
  },
  {
    type: 'trigger.button_clicked',
    label: '点击按钮时',
    category: 'common',
    icon: '👆',
    color: '#ff7a45',
    description: '用户点击自定义按钮时触发',
    triggerGroup: 'table',
    defaultConfig: {},
  },
  {
    type: 'trigger.form_submitted',
    label: '表单提交时',
    category: 'common',
    icon: '\uD83D\uDCDD',
    color: '#ff7a45',
    description: '用户提交表单时触发',
    triggerGroup: 'table',
    defaultConfig: {},
  },
  {
    type: 'trigger.comment_received',
    label: '收到评论时',
    category: 'common',
    icon: '💬',
    color: '#ff7a45',
    description: '记录收到新评论时触发',
    triggerGroup: 'table',
    defaultConfig: {},
  },
  {
    type: 'trigger.todo_completed',
    label: '待办完成时',
    category: 'common',
    icon: '\u2705',
    color: '#ff7a45',
    description: '待办事项被完成时触发',
    triggerGroup: 'todo',
    defaultConfig: {},
  },
  {
    type: 'trigger.scheduled',
    label: '定时触发',
    category: 'common',
    icon: '⏰',
    color: '#ff7a45',
    description: '按设定的时间规则定时触发',
    triggerGroup: 'tool',
    defaultConfig: {},
  },
  {
    type: 'trigger.webhook',
    label: 'Webhook',
    category: 'common',
    icon: '🔗',
    color: '#9254de',
    description: '接收到数据时（外部调用接口推送数据即启动工作流）',
    triggerGroup: 'tool',
    defaultConfig: {},
  },
  {
    type: 'trigger.manual',
    label: '手动触发',
    category: 'common',
    icon: '\u25B6\uFE0F',
    color: '#ff7a45',
    triggerGroup: 'tool',
  },
  // 逻辑
  {
    type: 'condition.if',
    label: '条件判断 (If/Else)',
    category: 'common',
    icon: '\uD83D\uDD00',
    color: '#5b5c61',
    description: '按条件判断后分支',
    defaultConfig: getIfElseDefaultConfig() as unknown as Record<string, unknown>,
    branches: IF_ELSE_BRANCH_PORTS,
  },
  {
    type: 'condition.switch',
    label: '多分支 (Switch)',
    category: 'common',
    icon: '\uD83C\uDF3F',
    color: '#5b5c61',
    description: '按多个条件分支，支持仅执行一条或同时执行多条',
    defaultConfig: getSwitchDefaultConfig() as unknown as Record<string, unknown>,
  },
  {
    type: 'loop.each_record',
    label: '循环',
    category: 'common',
    icon: '\uD83D\uDD01',
    color: '#5b5c61',
  },
  // AI
  {
    type: 'ai.analyze',
    label: 'AI 分析',
    category: 'ai',
    icon: '\u2728',
    color: '#3370ff',
  },
  {
    type: 'ai.classify',
    label: 'AI 分类',
    category: 'ai',
    icon: '\uD83C\uDFF7\uFE0F',
    color: '#3370ff',
  },
  {
    type: 'ai.generate_text',
    label: 'AI 生成文本',
    category: 'ai',
    icon: '\uD83D\uDCDD',
    color: '#3370ff',
  },
  {
    type: 'ai.agent',
    label: 'AI Agent',
    category: 'ai',
    icon: '\uD83E\uDD16',
    color: '#3370ff',
  },
  // 数据
  {
    type: 'record.create',
    label: '新增记录',
    category: 'common',
    icon: '\u2795',
    color: '#00b96b',
  },
  {
    type: 'record.update',
    label: '修改记录',
    category: 'common',
    icon: '\u270F\uFE0F',
    color: '#00b96b',
  },
  {
    type: 'record.find',
    label: '查找记录',
    category: 'common',
    icon: '\uD83D\uDD0D',
    color: '#00b96b',
  },
  // 通知
  {
    type: 'notify.feishu_message',
    label: '发送飞书消息',
    category: 'feishu',
    icon: '\uD83D\uDCAC',
    color: '#3370ff',
  },
  {
    type: 'notify.dingtalk_bot',
    label: '发送钉钉群机器人消息',
    category: 'feishu',
    icon: '\uD83D\uDCE8',
    color: '#3370ff',
  },
  // 钉钉
  {
    type: 'notify.dingtalk_message',
    label: '发送钉钉消息',
    category: 'dingtalk',
    icon: '\uD83D\uDCAC',
    color: '#0075FF',
    description: '通过钉钉机器人 Webhook 发送文本或 Markdown 消息',
    defaultConfig: {
      webhook: '',
      secret: '',
      msgType: 'text',
      title: '',
      body: '',
      atMobiles: [],
      atAll: false,
    },
  },
  {
    type: 'notify.dingtalk_email',
    label: '发送钉钉邮件',
    category: 'dingtalk',
    icon: '\u2709\uFE0F',
    color: '#0075FF',
    description: '通过钉钉发送邮件通知（待实现）',
    defaultConfig: {
      to: '',
      subject: '',
      body: '',
    },
  },
  // 终止
  { type: 'end', label: '结束', category: 'common', icon: '\uD83D\uDED1', color: '#8c8c8c' },
];

export function getNodeMeta(type: WorkflowNodeType): NodeTypeMeta | undefined {
  return NODE_TYPE_CATALOG.find((m) => m.type === type);
}
