import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthAudience } from '../../auth/decorators/auth-audience.decorator';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsumerAuthService } from './consumer-auth.service';

@Controller('api/v1/c/auth')
export class ConsumerAuthController {
  constructor(private readonly consumerAuthService: ConsumerAuthService) {}

  @Post('register')
  register(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.consumerAuthService.register(body, req);
  }

  @Get('password-public-key')
  getPasswordPublicKey() {
    return this.consumerAuthService.getPasswordPublicKey();
  }

  @Post('sms/send')
  sendSms(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.consumerAuthService.sendSms(body, req);
  }

  @Post('sms/verify')
  verifySms(@Body() body: Record<string, unknown>) {
    return this.consumerAuthService.verifySms(body);
  }

  @Post('login')
  login(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.consumerAuthService.login(body, req);
  }

  @Post('refresh')
  refresh(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.consumerAuthService.refresh(body, req);
  }

  @Post('logout')
  logout(@Body() body: Record<string, unknown>) {
    return this.consumerAuthService.logout(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('consumer')
  me(@CurrentUser() user: AuthUser) {
    return this.consumerAuthService.me(user);
  }

  @Post('switch-identity')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('consumer')
  switchIdentity(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.consumerAuthService.switchIdentity(user, body, req);
  }

  @Get('login-sessions')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('consumer')
  listLoginSessions(
    @CurrentUser() user: AuthUser,
    @Headers('x-refresh-token') refreshToken?: string,
  ) {
    return this.consumerAuthService.listLoginSessions(user, refreshToken);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('consumer')
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.consumerAuthService.updateProfile(user, body);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @AuthAudience('consumer')
  updatePassword(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.consumerAuthService.updatePassword(user, body);
  }
}
