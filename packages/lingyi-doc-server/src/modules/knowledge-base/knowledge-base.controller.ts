import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import type {
  KnowledgeBaseCover,
  KnowledgeBaseVisibility,
  KbMemberRole,
  KbNodeType,
} from '../../types/knowledge-base';
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller('api/v1/c/knowledge-bases')
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('sortBy') sortBy?: string,
    @Query('keyword') keyword?: string,
  ) {
    try {
      const sort = sortBy === 'created' || sortBy === 'name' ? sortBy : 'updated';
      return this.knowledgeBaseService.list(user, { sortBy: sort, keyword });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('list failed', err);
      throw new BusinessException(100005, '获取知识库列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      const name = typeof body.name === 'string' ? body.name : '';
      const visibility = body.visibility === 'organization' ? 'organization' : 'members';
      return this.knowledgeBaseService.create(user, {
        name,
        description: typeof body.description === 'string' ? body.description : undefined,
        emoji: typeof body.emoji === 'string' ? body.emoji : undefined,
        cover: body.cover === 'sunset' ? 'sunset' : body.cover === 'blue' ? 'blue' : undefined,
        visibility: visibility as KnowledgeBaseVisibility,
        orgId: typeof body.orgId === 'string' ? body.orgId : undefined,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create failed', err);
      throw new BusinessException(100005, '创建知识库失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':kbId')
  async getById(@CurrentUser() user: AuthUser, @Param('kbId') kbId: string) {
    try {
      return this.knowledgeBaseService.getById(user, kbId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('getById failed', err);
      throw new BusinessException(100005, '获取知识库失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':kbId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return this.knowledgeBaseService.update(user, kbId, {
        name: typeof body.name === 'string' ? body.name : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        emoji: typeof body.emoji === 'string' ? body.emoji : undefined,
        cover: body.cover === 'sunset' || body.cover === 'blue'
          ? body.cover as KnowledgeBaseCover
          : undefined,
        visibility: body.visibility === 'organization' || body.visibility === 'members'
          ? body.visibility as KnowledgeBaseVisibility
          : undefined,
        orgId: body.orgId === null
          ? null
          : typeof body.orgId === 'string'
            ? body.orgId
            : undefined,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('update failed', err);
      throw new BusinessException(100005, '更新知识库失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':kbId')
  async remove(@CurrentUser() user: AuthUser, @Param('kbId') kbId: string) {
    try {
      return this.knowledgeBaseService.remove(user, kbId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('remove failed', err);
      throw new BusinessException(100005, '删除知识库失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':kbId/nodes')
  async listNodes(@CurrentUser() user: AuthUser, @Param('kbId') kbId: string) {
    try {
      return this.knowledgeBaseService.listNodes(user, kbId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('listNodes failed', err);
      throw new BusinessException(100005, '获取目录失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':kbId/nodes')
  async createNode(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const nodeType = typeof body.nodeType === 'string' ? body.nodeType : 'page';
      if (!['page', 'doc_ref', 'folder'].includes(nodeType)) {
        throw new BusinessException(100002, '无效的节点类型');
      }
      return this.knowledgeBaseService.createNode(user, kbId, {
        title: typeof body.title === 'string' ? body.title : '',
        nodeType: nodeType as KbNodeType,
        parentId: typeof body.parentId === 'string' ? body.parentId : null,
        docId: typeof body.docId === 'string' ? body.docId : undefined,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('createNode failed', err);
      throw new BusinessException(100005, '创建节点失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':kbId/nodes/:nodeId')
  async updateNode(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return this.knowledgeBaseService.updateNode(user, kbId, nodeId, {
        title: typeof body.title === 'string' ? body.title : undefined,
        parentId: body.parentId === null
          ? null
          : typeof body.parentId === 'string'
            ? body.parentId
            : undefined,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('updateNode failed', err);
      throw new BusinessException(100005, '更新节点失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':kbId/nodes/:nodeId')
  async removeNode(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Param('nodeId') nodeId: string,
    @Query('deleteDocument') deleteDocument?: string,
  ) {
    try {
      return this.knowledgeBaseService.removeNode(
        user,
        kbId,
        nodeId,
        deleteDocument === 'true' || deleteDocument === '1',
      );
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('removeNode failed', err);
      throw new BusinessException(100005, '删除节点失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':kbId/nodes/:parentNodeId/doc')
  async createDocument(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Param('parentNodeId') parentNodeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return this.knowledgeBaseService.createDocument(user, kbId, parentNodeId, {
        title: typeof body.title === 'string' ? body.title : '未命名文档',
        docType: typeof body.docType === 'string' ? body.docType : 'freeform',
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('createDocument failed', err);
      throw new BusinessException(100005, '创建文档失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':kbId/members')
  async listMembers(@CurrentUser() user: AuthUser, @Param('kbId') kbId: string) {
    try {
      return this.knowledgeBaseService.listMembers(user, kbId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('listMembers failed', err);
      throw new BusinessException(100005, '获取成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':kbId/members')
  async addMember(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const role = typeof body.role === 'string' ? body.role : 'viewer';
      if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) {
        throw new BusinessException(100002, '无效的成员角色');
      }
      return this.knowledgeBaseService.addMember(user, kbId, {
        userId: typeof body.userId === 'string' ? body.userId : '',
        role: role as KbMemberRole,
      });
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('addMember failed', err);
      throw new BusinessException(100005, '添加成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':kbId/members/:userId')
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('kbId') kbId: string,
    @Param('userId') memberUserId: string,
  ) {
    try {
      return this.knowledgeBaseService.removeMember(user, kbId, memberUserId);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('removeMember failed', err);
      throw new BusinessException(100005, '移除成员失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
