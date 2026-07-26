import { authFetch } from '../stores/authStore';

export interface SystemFeatures {
  collab: boolean;
  comments: boolean;
  ai: boolean;
}

export async function fetchSystemFeatures(): Promise<SystemFeatures> {
  return authFetch<SystemFeatures>('/api/v1/system/features');
}
