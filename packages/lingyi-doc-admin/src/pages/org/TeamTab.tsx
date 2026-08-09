import React from 'react';
import { Card, Descriptions, Statistic } from 'antd';
import { TeamOutlined, UserOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { OrganizationNode, TenantMember, TenantOption } from '../../types/org';

interface TeamTabProps {
  tenant?: TenantOption;
  orgs: OrganizationNode[];
  members: TenantMember[];
}

function countOrgs(nodes: OrganizationNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countOrgs(n.children ?? []), 0);
}

export const TeamTab: React.FC<TeamTabProps> = ({ tenant, orgs, members }) => {
  const activeMembers = members.filter(m => m.status === 1).length;

  return (
    <div className="org-team-tab">
      <Card title="团队概览" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="团队名称">{tenant?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="团队 ID">{tenant?.id ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <div className="org-team-stats">
        <Card>
          <Statistic title="成员总数" value={members.length} prefix={<UserOutlined />} />
        </Card>
        <Card>
          <Statistic title="正常成员" value={activeMembers} prefix={<TeamOutlined />} valueStyle={{ color: '#1677ff' }} />
        </Card>
        <Card>
          <Statistic title="部门数量" value={countOrgs(orgs)} prefix={<ApartmentOutlined />} />
        </Card>
      </div>
    </div>
  );
};
