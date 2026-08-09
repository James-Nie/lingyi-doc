import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { message } from 'antd';
import {
  listMembers,
  listOrganizations,
  listPositions,
} from '../../api/org';
import { authStore } from '../../stores/authStore';
import { tenantStore } from '../../stores/tenantStore';
import type { OrganizationNode, PositionGroupNode, TenantMember } from '../../types/org';
import { PositionsTab } from './PositionsTab';
import './org-members.css';

export const OrgPositionsPage: React.FC = () => {
  const tenantState = useSyncExternalStore(tenantStore.subscribe, tenantStore.getState);
  const tenantId = tenantState.tenantId;
  const [orgs, setOrgs] = useState<OrganizationNode[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [positionGroups, setPositionGroups] = useState<PositionGroupNode[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [orgList, memberList, positionList] = await Promise.all([
        listOrganizations(tenantId),
        listMembers(tenantId),
        listPositions(tenantId),
      ]);
      setOrgs(orgList);
      setMembers(memberList);
      setPositionGroups(positionList);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
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

  return (
    <PositionsTab
      tenantId={tenantId}
      orgs={orgs}
      members={members}
      positionGroups={positionGroups}
      loading={loading}
      onReload={() => void reload()}
    />
  );
};