import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import {
  isValidCompanySize,
  isValidPhone,
  isValidScenario,
  validateDemoProducts,
} from '../../constants/demoRequest';
import { DemoRequestRepository } from '../../repositories/demo-request.repository';
import { AuthService } from '../../services/auth.service';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX = 5;

@Controller('api/v1/c/demo-requests')
export class DemoController {
  private readonly logger = new Logger(DemoController.name);

  constructor(
    private readonly demoRequestRepository: DemoRequestRepository,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OptionalJwtAuthGuard)
  @AuthAudience('consumer')
  async create(@Body() body: Record<string, unknown>, @Req() req: Request, @CurrentUser() user?: AuthUser) {
    try {
      const {
        name,
        phone,
        company,
        companySize,
        scenario,
        products,
        questions,
      } = body ?? {};

      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
      const trimmedCompany = typeof company === 'string' ? company.trim() : '';
      const trimmedSize = typeof companySize === 'string' ? companySize.trim() : '';
      const trimmedScenario = typeof scenario === 'string' ? scenario.trim() : '';
      const trimmedQuestions = typeof questions === 'string' ? questions.trim() : '';

      if (!trimmedName) throw new BusinessException(100002, '请填写姓名');
      if (!trimmedPhone) throw new BusinessException(100002, '请填写联系电话');
      if (!isValidPhone(trimmedPhone)) throw new BusinessException(100002, '联系电话格式不正确');

      const validProducts = validateDemoProducts(products);
      if (!validProducts) throw new BusinessException(100002, '请至少选择一项有效的产品');
      if (!trimmedCompany) throw new BusinessException(100002, '请填写公司名称');
      if (!trimmedSize || !isValidCompanySize(trimmedSize)) {
        throw new BusinessException(100002, '请选择有效的企业规模');
      }
      if (!trimmedScenario || !isValidScenario(trimmedScenario)) {
        throw new BusinessException(100002, '请选择有效的使用场景');
      }
      if (!trimmedQuestions) throw new BusinessException(100002, '请填写主要想了解的问题');
      if (trimmedQuestions.length > 2000) {
        throw new BusinessException(100002, '问题描述不能超过 2000 字');
      }

      const ip = this.authService.getClientIp(req);
      if (ip) {
        const recentCount = await this.demoRequestRepository.countRecentByIp(ip, RATE_LIMIT_WINDOW_MINUTES);
        if (recentCount >= RATE_LIMIT_MAX) {
          throw new BusinessException(100004, '提交过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      const row = await this.demoRequestRepository.create({
        name: trimmedName.slice(0, 100),
        phone: trimmedPhone.slice(0, 20),
        company: trimmedCompany.slice(0, 200),
        companySize: trimmedSize,
        scenario: trimmedScenario,
        products: validProducts,
        questions: trimmedQuestions,
        ip,
        userAgent: this.authService.getUserAgent(req),
        submittedBy: user?.userId ?? null,
      });

      return {
        id: row.id,
        message: '申请已提交，顾问将尽快与您联系',
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('create failed', err);
      throw new BusinessException(100005, '提交失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
