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
] as const;

export const DEMO_COMPANY_SIZE_OPTIONS = [
  '1-10 人',
  '11-50 人',
  '51-200 人',
  '201-500 人',
  '500 人以上',
] as const;

export const DEMO_SCENARIO_OPTIONS = [
  '团队协作',
  '知识管理',
  '项目管理',
  '业务流程搭建',
  '行业定制化',
  '私有化部署',
  '其他',
] as const;

export const DEMO_REQUEST_STATUSES = ['pending', 'contacted', 'closed'] as const;

export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number];

const PRODUCT_SET = new Set<string>(DEMO_PRODUCT_OPTIONS);
const SIZE_SET = new Set<string>(DEMO_COMPANY_SIZE_OPTIONS);
const SCENARIO_SET = new Set<string>(DEMO_SCENARIO_OPTIONS);

export function isValidPhone(phone: string): boolean {
  const normalized = phone.replace(/[\s-]/g, '');
  return /^(\+?\d{7,15}|1[3-9]\d{9})$/.test(normalized);
}

export function validateDemoProducts(products: unknown): string[] | null {
  if (!Array.isArray(products) || products.length === 0) return null;
  const values = products.map(p => String(p).trim()).filter(Boolean);
  if (values.length === 0) return null;
  if (values.some(p => !PRODUCT_SET.has(p))) return null;
  return [...new Set(values)];
}

export function isValidCompanySize(value: string): boolean {
  return SIZE_SET.has(value);
}

export function isValidScenario(value: string): boolean {
  return SCENARIO_SET.has(value);
}

export function isValidDemoStatus(value: string): value is DemoRequestStatus {
  return (DEMO_REQUEST_STATUSES as readonly string[]).includes(value);
}
