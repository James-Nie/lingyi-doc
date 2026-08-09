import { authFetch } from '../stores/authStore';
import type { SearchResponse } from '../components/search/search.types';

export async function searchDocuments(
  query: string,
  limit = 20,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return authFetch<SearchResponse>(`/api/search?${params}`);
}