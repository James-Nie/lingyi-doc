import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { message } from 'antd';
import {
  listMembers,
  listOrganizations,
} from '../../api/org';
import { authStore } from '../../stores/authStore';
import { tenantStore } from '../../stores/tenantStore';
import type { OrganizationNode, TenantMember } from '../../types/org';
import { TeamTab } from './TeamTab';
import './org-members.css';

export const OrgTeamPage: React.FC = () => {
  const tenantState = useSyncExternalStore(tenantStore.subscribe, tenantStore.getState);
  const tenantId = tenantState.tenantId;
  const [orgs, setOrgs] = useState<OrganizationNode[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [orgList, memberList] = await Promise.all([
        listOrganizations(tenantId),
        listMembers(tenantId),
      ]);
      setOrgs(orgList);
      setMembers(memberList);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantState.loaded && authStore.getAccessToken()) {
      void tenantStore.load();
    }
  }, [tenantState.loaded]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const currentTenant = tenantState.tenants.find(t => t.id === tenantId);

  return <TeamTab tenant={currentTenant} orgs={orgs} members={members} />;
};