import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  TenantPositionEntity,
  TenantPositionGroupEntity,
} from '../database/entities/tenant.entity';

export interface PositionGroupNode {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  positions: PositionNode[];
}

export interface PositionNode {
  id: string;
  tenantId: string;
  groupId: string;
  name: string;
  avatarKey: string;
  sortOrder: number;
  memberCount?: number;
}

@Injectable()
export class PositionRepository {
  constructor(
    @InjectRepository(TenantPositionGroupEntity)
    private readonly groupRepo: Repository<TenantPositionGroupEntity>,
    @InjectRepository(TenantPositionEntity)
    private readonly positionRepo: Repository<TenantPositionEntity>,
  ) {}

  async listGroupsWithPositions(tenantId: string): Promise<PositionGroupNode[]> {
    const groups = await this.groupRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    const positions = await this.positionRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return groups.map((g) => ({
      id: g.id,
      tenantId: g.tenantId,
      name: g.name,
      sortOrder: g.sortOrder,
      positions: positions
        .filter((p) => p.groupId === g.id)
        .map((p) => ({
          id: p.id,
          tenantId: p.tenantId,
          groupId: p.groupId,
          name: p.name,
          avatarKey: p.avatarKey,
          sortOrder: p.sortOrder,
        })),
    }));
  }

  async findById(tenantId: string, positionId: string): Promise<TenantPositionEntity | null> {
    return this.positionRepo.findOne({ where: { id: positionId, tenantId } });
  }

  async findGroupById(tenantId: string, groupId: string): Promise<TenantPositionGroupEntity | null> {
    return this.groupRepo.findOne({ where: { id: groupId, tenantId } });
  }

  async updateGroup(tenantId: string, groupId: string, name: string): Promise<TenantPositionGroupEntity | null> {
    const entity = await this.findGroupById(tenantId, groupId);
    if (!entity) return null;
    entity.name = name.trim();
    return this.groupRepo.save(entity);
  }

  async deleteGroup(tenantId: string, groupId: string): Promise<boolean> {
    const entity = await this.findGroupById(tenantId, groupId);
    if (!entity) return false;
    await this.groupRepo.delete({ id: groupId, tenantId });
    return true;
  }

  async updatePosition(
    tenantId: string,
    positionId: string,
    patch: { name?: string; groupId?: string; avatarKey?: string },
  ): Promise<TenantPositionEntity | null> {
    const entity = await this.findById(tenantId, positionId);
    if (!entity) return null;
    if (patch.name !== undefined) entity.name = patch.name.trim();
    if (patch.groupId !== undefined) entity.groupId = patch.groupId;
    if (patch.avatarKey !== undefined) entity.avatarKey = patch.avatarKey;
    return this.positionRepo.save(entity);
  }

  async deletePosition(tenantId: string, positionId: string): Promise<boolean> {
    const entity = await this.findById(tenantId, positionId);
    if (!entity) return false;
    await this.positionRepo.delete({ id: positionId, tenantId });
    return true;
  }

  async listPositionIdsByGroup(tenantId: string, groupId: string): Promise<string[]> {
    const rows = await this.positionRepo.find({ where: { tenantId, groupId }, select: ['id'] });
    return rows.map(r => r.id);
  }

  async create(input: {
    tenantId: string;
    groupId: string;
    name: string;
    avatarKey?: string;
    sortOrder?: number;
  }): Promise<PositionNode> {
    const id = uuidv4();
    await this.positionRepo.save({
      id,
      tenantId: input.tenantId,
      groupId: input.groupId,
      name: input.name.trim(),
      avatarKey: input.avatarKey ?? 'avatar_0',
      sortOrder: input.sortOrder ?? 0,
    });
    const entity = await this.positionRepo.findOne({ where: { id } });
    if (!entity) throw new Error('创建职位失败');
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      groupId: entity.groupId,
      name: entity.name,
      avatarKey: entity.avatarKey,
      sortOrder: entity.sortOrder,
    };
  }

  async createGroup(tenantId: string, name: string): Promise<TenantPositionGroupEntity> {
    const id = uuidv4();
    const sortOrder = await this.groupRepo.count({ where: { tenantId } });
    await this.groupRepo.save({ id, tenantId, name: name.trim(), sortOrder });
    const entity = await this.groupRepo.findOne({ where: { id } });
    if (!entity) throw new Error('创建职位分组失败');
    return entity;
  }
}
