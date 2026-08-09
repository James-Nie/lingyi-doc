export const NAV_LINKS = [
  { label: '产品功能', href: '#features' },
  { label: '行业方案', href: '#industry' },
  { label: '定价方案', href: '#pricing' },
  { label: '帮助中心', href: '#help' },
  { label: '开放平台', href: '#open' },
];

export const HERO_CHECKS = ['支持私有化部署', '国产化信创适配', '全端数据同步'];

export const HERO_CAROUSEL = [
  '文档编辑 | 多维表 | 画板 | PPT',
  '实时协同 | 权限管控 | 版本历史',
  '知识库 | 模板中心 | 团队空间',
];

export const VALUE_CARDS = [
  {
    color: '#dbeafe',
    title: '全品类创作覆盖',
    desc: '替代 Word、Excel、PPT、Visio 等多款办公软件，降低采购与运维成本，一个平台满足全部创作需求',
  },
  {
    color: '#dcfce7',
    title: '实时协同无壁垒',
    desc: '多人同时编辑、实时同步、评论批注、@提醒，权限精细到文档/文件夹/组织，打破协作信息孤岛',
  },
  {
    color: '#ffedd5',
    title: '知识资产可沉淀',
    desc: '结构化知识库管理，全文检索、标签分类、权限管控，让团队经验与文档资产持续积累复用',
  },
];

export const FEATURE_ITEMS = [
  {
    title: '普通表格',
    desc: '深度兼容 Excel 函数与格式，在线数据计算与协同填报',
    previewImage: '/home/features/sheet.png',
  },
  {
    title: '在线文档',
    desc: '沉浸式富文本编辑，支持 Markdown、代码块、LaTeX、40+ 特色卡片',
    previewImage: '/home/features/doc.png',
  },
  {
    title: '多维表格',
    desc: '支持看板、甘特图、日历等多视图，零代码搭建轻量业务系统',
    previewImage: '/home/features/base.png',
  },
  {
    title: '在线 PPT',
    desc: '云端演示文稿制作，支持远程播放与协同修改',
    previewImage: '/home/features/ppt.png',
  },
  {
    title: '思维导图',
    desc: '图形化梳理思路，一键转文档大纲，多人实时编辑',
    previewImage: '/home/features/mindnote.png',
  },
  {
    title: '在线画板',
    desc: '自由绘制流程图、架构图，拖拽操作，团队实时共创',
    previewImage: '/home/features/board.png',
  },
  {
    title: '知识库管理',
    desc: '结构化目录，全文检索，权限分级，团队知识资产沉淀',
    previewImage: '/home/features/knowledge-base.png',
  },
];

export const ENTERPRISE_CARDS = [
  { color: '#dbeafe', title: '私有化部署', desc: '支持本地机房、私有云部署，数据完全自主可控，适配律所、金融、政务等强合规需求' },
  { color: '#dcfce7', title: '信创适配', desc: '全面适配国产操作系统、数据库、中间件，满足党政机关、国企央企的信创采购要求' },
  { color: '#fef9c3', title: '全链路权限管控', desc: '从组织架构到文档颗粒度，查看、编辑、下载、外发全维度控制，操作日志全程留痕' },
  { color: '#fce7f3', title: '定制化开发', desc: '支持对接企业 OA、CRM、ERP 等系统，按行业需求定制功能模块，灵活适配专属场景' },
];

export const INDUSTRY_CARDS = [
  { title: '律所法务', desc: '合同卷宗管理，权限严格隔离，操作合规留痕' },
  { title: '建筑工程', desc: '工程资料协同，图纸归档管理，项目分级权限' },
  { title: '教育科研', desc: '备课资源库，课题协作，作业与信息收集' },
  { title: '企业服务', desc: '项目管理，客户资料管理，团队知识库沉淀' },
  { title: '政务国企', desc: '信创全线适配，电子档案管理，数据安全可控' },
  { title: '电商零售', desc: '运营素材库，数据报表协同，门店信息同步' },
];

export const PRICING_PLANS = [
  {
    name: '免费版',
    price: '¥0',
    unit: '/ 永久',
    audience: '个人用户、10 人以内小团队',
    features: ['基础文档/表格/PPT 功能', '5GB 团队存储空间', '基础协作权限'],
    cta: '立即注册',
    variant: 'outline' as const,
  },
  {
    name: '商业版',
    price: '¥30',
    unit: '/ 人 / 月',
    audience: '成长型企业、中小团队',
    features: ['全部功能开放（含多维表、画板、问卷）', '100GB 起存储空间', '管理后台与组织架构', '工作日优先技术支持'],
    cta: '立即开通',
    variant: 'primary' as const,
    recommended: true,
  },
  {
    name: '企业版',
    price: '定制报价',
    unit: '',
    audience: '中大型企业、政企单位',
    features: ['全部功能不限量', '私有化/混合云部署', '国产化信创适配', '定制功能开发', '专属客户成功经理', '7×24 小时技术支持'],
    cta: '预约咨询',
    variant: 'dark' as const,
  },
];

export const FOOTER_COLUMNS = [
  {
    title: '产品',
    links: ['功能总览', '更新日志', '帮助中心', '模板中心'],
  },
  {
    title: '解决方案',
    links: ['律师行业', '建筑工程', '教育科研', '政务信创'],
  },
  {
    title: '关于我们',
    links: ['公司介绍', '商务合作', '加入我们', '隐私政策'],
  },
];

export const DEMO_PRODUCT_OPTIONS = [
  '在线文档',
  '普通表格',
  '多维表格',
  '在线画板',
  '在线 PPT',
  '智能问卷',
  '思维导图',
  '知识库管理',
  '全品类套件',
];

export const DEMO_COMPANY_SIZE_OPTIONS = [
  '1-10 人',
  '11-50 人',
  '51-200 人',
  '201-500 人',
  '500 人以上',
];

export const DEMO_SCENARIO_OPTIONS = [
  '团队协作',
  '知识管理',
  '项目管理',
  '业务流程搭建',
  '行业定制化',
  '私有化部署',
  '其他',
];

export const DEMO_HELP_ITEMS = [
  '提供一对一产品演示和产品介绍',
  '详尽的产品功能文档，帮助您快速上手',
  '专业的技术顾问，帮您解答技术问题',
];
