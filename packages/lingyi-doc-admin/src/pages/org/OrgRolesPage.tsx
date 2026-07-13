import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { message } from 'antd';
import {
  listMembers,
  listOrganizations,
  listPositions,
  listRoles,
} from '../../api/org';
import { tenantStore } from '../../stores/tenantStore';
import type { OrganizationNode, PositionGroupNode, TenantMember, TenantRoleNode } from '../../types/org';
import { RolesTab } from './RolesTab';
import './org-members.css';

export const OrgRolesPage: React.FC = () => {
  const tenantState = useSyncExternalStore(tenantStore.subscribe, tenantStore.getState);
  const tenantId = tenantState.tenantId;
  const [orgs, setOrgs] = useState<OrganizationNode[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [roles, setRoles] = useState<TenantRoleNode[]>([]);
  const [positionGroups, setPositionGroups] = useState<PositionGroupNode[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [orgList, memberList, roleList, positionList] = await Promise.all([
        listOrganizations(tenantId),
        listMembers(tenantId),
        listRoles(tenantId),
        listPositions(tenantId),
      ]);
      setOrgs(orgList);
      setMembers(memberList);
      setRoles(roleList);
      setPositionGroups(positionList);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="org-management-page org-roles-page">
      <RolesTab
        tenantId={tenantId}
        orgs={orgs}
        members={members}
        roles={roles}
        positionGroups={positionGroups}
        loading={loading}
        onReload={() => void reload()}
      />
    </div>
  );
};
