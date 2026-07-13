import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Tabs, message } from 'antd';
import {
  listMembers,
  listOrganizations,
  listPositions,
} from '../../api/org';
import { tenantStore } from '../../stores/tenantStore';
import type { OrganizationNode, PositionGroupNode, TenantMember } from '../../types/org';
import { MembersTab } from './MembersTab';
import { PositionsTab } from './PositionsTab';
import { TeamTab } from './TeamTab';
import './org-members.css';

export const OrgManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('members');
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
    void reload();
  }, [reload]);

  const currentTenant = tenantState.tenants.find(t => t.id === tenantId);

  return (
    <div className="org-management-page">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        className="org-management-tabs"
        items={[
          {
            key: 'members',
            label: '成员管理',
            children: (
              <MembersTab
                tenantId={tenantId}
                orgs={orgs}
                members={members}
                positionGroups={positionGroups}
                loading={loading}
                onReload={() => void reload()}
              />
            ),
          },
          {
            key: 'team',
            label: '团队管理',
            children: (
              <TeamTab tenant={currentTenant} orgs={orgs} members={members} />
            ),
          },
          {
            key: 'positions',
            label: '职位维护',
            children: (
              <PositionsTab
                tenantId={tenantId}
                orgs={orgs}
                members={members}
                positionGroups={positionGroups}
                loading={loading}
                onReload={() => void reload()}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

/** @deprecated 使用 OrgManagementPage */
export const OrgMembersPage = OrgManagementPage;
