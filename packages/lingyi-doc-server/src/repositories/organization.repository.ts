import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationEntity } from '../database/entities/tenant.entity';
import type { DbOrganization, OrganizationNode } from '../types/session';

function toDbOrganization(entity: OrganizationEntity): DbOrganization {
  return {
    id: entity.id,
    tenant_id: entity.tenantId,
    parent_id: entity.parentId,
    name: entity.name,
    sort_order: entity.sortOrder,
    leader_user_id: entity.leaderUserId,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
  };
}

function buildTree(rows: DbOrganization[]): OrganizationNode[] {
  const map = new Map<string, OrganizationNode>();
  const roots: OrganizationNode[] = [];

  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      tenantId: row.tenant_id,
      parentId: row.parent_id,
      name: row.name,
      sortOrder: row.sort_order,
      leaderUserId: row.leader_user_id ?? null,
      children: [],
    });
  }

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: OrganizationNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    nodes.forEach((n) => {
      if (n.children?.length) sortNodes(n.children);
    });
  };
  sortNodes(roots);
  return roots;
}

@Injectable()
export class OrganizationRepository {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
  ) {}

  async listByTenant(tenantId: string): Promise<OrganizationNode[]> {
    const entities = await this.orgRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return buildTree(entities.map(toDbOrganization));
  }

  async create(input: {
    tenantId: string;
    name: string;
    parentId?: string | null;
    sortOrder?: number;
    leaderUserId?: string | null;
  }): Promise<DbOrganization> {
    const id = uuidv4();
    await this.orgRepo.save({
      id,
      tenantId: input.tenantId,
      parentId: input.parentId ?? null,
      name: input.name.trim(),
      sortOrder: input.sortOrder ?? 0,
      leaderUserId: input.leaderUserId ?? null,
    });
    const entity = await this.orgRepo.findOne({ where: { id } });
    if (!entity) throw new Error('创建组织失败');
    return toDbOrganization(entity);
  }

  async update(
    tenantId: string,
    orgId: string,
    patch: { name?: string; parentId?: string | null; leaderUserId?: string | null },
  ): Promise<DbOrganization | null> {
    const entity = await this.orgRepo.findOne({ where: { id: orgId, tenantId } });
    if (!entity) return null;
    if (patch.name != null) entity.name = patch.name.trim();
    if (patch.parentId !== undefined) entity.parentId = patch.parentId;
    if (patch.leaderUserId !== undefined) entity.leaderUserId = patch.leaderUserId;
    await this.orgRepo.save(entity);
    return toDbOrganization(entity);
  }

  async delete(tenantId: string, orgId: string): Promise<boolean> {
    const entity = await this.orgRepo.findOne({ where: { id: orgId, tenantId } });
    if (!entity) return false;
    const childCount = await this.orgRepo.count({ where: { tenantId, parentId: orgId } });
    if (childCount > 0) throw new Error('请先删除子部门');
    await this.orgRepo.delete({ id: orgId, tenantId });
    return true;
  }

  async findById(tenantId: string, orgId: string): Promise<DbOrganization | null> {
    const entity = await this.orgRepo.findOne({ where: { id: orgId, tenantId } });
    return entity ? toDbOrganization(entity) : null;
  }
}
