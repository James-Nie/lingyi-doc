import {
  Controller,
  HttpStatus,
  Logger,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../auth/guards/tenant-context.guard';
import { OssService } from '../../services/oss.service';
import { MembershipService } from '../membership/membership.service';

@Controller(['api/v1/c/uploads', 'api/v1/uploads'])
@UseGuards(JwtAuthGuard, TenantContextGuard)
@AuthAudience('consumer')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly ossService: OssService,
    private readonly membershipService: MembershipService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      if (!this.ossService.isEnabled()) {
        throw new BusinessException(500001, 'OSS 未配置', HttpStatus.SERVICE_UNAVAILABLE);
      }

      if (!file) {
        throw new BusinessException(100002, '缺少上传文件');
      }

      const mctx = await this.membershipService.resolveContext(user);
      await this.membershipService.assertWritableForDocument(user, {
        scope: mctx.spaceKind === 'team' ? 2 : 1,
        ownerId: user.userId,
        tenantId: mctx.tenantId,
        storageSize: 0,
      });
      await this.membershipService.assertStorageDeltaForDocument(user, {
        scope: mctx.spaceKind === 'team' ? 2 : 1,
        ownerId: user.userId,
        tenantId: mctx.tenantId,
        storageSize: 0,
      }, file.size);

      const tenantPart = user.currentTenantId || 'personal';
      const ext = path.extname(file.originalname || '').slice(0, 16);
      const safeName = (file.originalname || 'file')
        .replace(/[^\w.\-()\u4e00-\u9fa5]/g, '_')
        .slice(0, 120);
      const objectKey = this.ossService.buildObjectKey([
        'uploads',
        tenantPart,
        user.userId,
        `${uuidv4()}${ext || path.extname(safeName)}`,
      ]);

      const url = await this.ossService.putObject(objectKey, file.buffer, file.mimetype || undefined);

      return {
        url,
        objectKey,
        name: safeName,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('OSS upload failed', err);
      throw new BusinessException(
        500002,
        err instanceof Error ? err.message : '上传失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
