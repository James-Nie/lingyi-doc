export type DemoRequestStatus = 'pending' | 'contacted' | 'closed';

export const DEMO_STATUS_LABELS: Record<DemoRequestStatus, string> = {
  pending: '待处理',
  contacted: '跟进中',
  closed: '已处理',
};

export const DEMO_STATUS_COLORS: Record<DemoRequestStatus, string> = {
  pending: 'orange',
  contacted: 'blue',
  closed: 'green',
};

export interface DemoRequestItem {
  id: string;
  name: string;
  phone: string;
  company: string;
  companySize: string;
  scenario: string;
  products: string[];
  questions: string;
  status: DemoRequestStatus;
  isProcessed: boolean;
  ip: string | null;
  userAgent?: string | null;
  submittedBy: string | null;
  contactedAt: number | null;
  handleComment: string | null;
  processedBy: string | null;
  processedByName: string | null;
  processedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
