import { adminFetch } from './authStore';
import type { TenantOption } from '../types/org';

const TENANT_ID_KEY = 'lingyi_doc_admin_tenant_id';

interface TenantState {
  tenants: TenantOption[];
  tenantId: string | undefined;
  loaded: boolean;
}

type Listener = () => void;

let state: TenantState = {
  tenants: [],
  tenantId: localStorage.getItem(TENANT_ID_KEY) ?? undefined,
  loaded: false,
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(fn => fn());
}

function setState(patch: Partial<TenantState>) {
  state = { ...state, ...patch };
  emit();
}

function persistTenantId(tenantId: string | undefined) {
  if (tenantId) localStorage.setItem(TENANT_ID_KEY, tenantId);
  else localStorage.removeItem(TENANT_ID_KEY);
}

export const tenantStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getState() {
    return state;
  },

  getTenantId() {
    return state.tenantId;
  },

  getCurrentTenant() {
    return state.tenants.find(t => t.id === state.tenantId);
  },

  setTenantId(tenantId: string) {
    if (!state.tenants.some(t => t.id === tenantId)) return;
    persistTenantId(tenantId);
    setState({ tenantId });
  },

  async load() {
    try {
      const data = await adminFetch<{ items: TenantOption[] }>('/api/v1/admin/tenants/workspace');
      const tenants = data.items ?? [];
      let tenantId = state.tenantId;
      if (!tenantId || !tenants.some(t => t.id === tenantId)) {
        tenantId = tenants[0]?.id;
      }
      if (tenantId) persistTenantId(tenantId);
      setState({ tenants, tenantId, loaded: true });
    } catch {
      setState({ tenants: [], tenantId: undefined, loaded: true });
    }
  },

  reset() {
    persistTenantId(undefined);
    setState({ tenants: [], tenantId: undefined, loaded: false });
  },
};
