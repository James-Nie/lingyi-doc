import { authStore } from '../stores/authStore';

export interface SubmitDemoRequestPayload {
  name: string;
  phone: string;
  company: string;
  companySize: string;
  scenario: string;
  products: string[];
  questions: string;
}

interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

export async function submitDemoRequest(payload: SubmitDemoRequestPayload): Promise<{ id: string; message: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = authStore.getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch('/api/v1/c/demo-requests', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as ApiResponse<{ id: string; message: string }>;

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || '提交失败，请稍后重试');
  }

  return json.data!;
}
