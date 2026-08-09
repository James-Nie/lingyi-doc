import type { PublicFormSubmissionSummary } from '../../api/documentShare';

export interface FormSubmissionPreviewField {
  label: string;
  value: string;
}

export interface FormSubmissionItem {
  recordId: string;
  createdAt: number;
  createdBy: string;
  fields: FormSubmissionPreviewField[];
  isLatest: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatSubmissionTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function mapApiSubmissions(items: PublicFormSubmissionSummary[]): FormSubmissionItem[] {
  return items.map(item => ({
    recordId: item.recordId,
    createdAt: item.createdAt,
    createdBy: item.createdBy,
    fields: item.fields,
    isLatest: item.isLatest,
  }));
}
