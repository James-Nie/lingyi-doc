import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Dypnsapi20170525, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from '@alicloud/dypnsapi20170525';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import { RuntimeOptions } from '@alicloud/tea-util';

@Injectable()
export class AliyunSmsService {
  private readonly logger = new Logger(AliyunSmsService.name);
  private client: Dypnsapi20170525 | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const sms = this.config.get('sms') as {
      accessKeyId?: string;
      accessKeySecret?: string;
      signName?: string;
    };
    return Boolean(sms?.accessKeyId && sms?.accessKeySecret && sms?.signName);
  }

  isMockMode(): boolean {
    return this.config.get<boolean>('sms.mock') === true;
  }

  private getClient(): Dypnsapi20170525 {
    if (this.client) return this.client;

    const sms = this.config.get('sms') as {
      accessKeyId: string;
      accessKeySecret: string;
      endpoint: string;
    };

    const openApiConfig = new OpenApiConfig({
      accessKeyId: sms.accessKeyId,
      accessKeySecret: sms.accessKeySecret,
      endpoint: sms.endpoint || 'dypnsapi.aliyuncs.com',
    });
    this.client = new Dypnsapi20170525(openApiConfig);
    return this.client;
  }

  async sendVerifyCode(input: {
    phoneNumber: string;
    codeMinutes: number;
  }): Promise<{ outId: string }> {
    const outId = randomUUID();

    if (this.isMockMode()) {
      this.logger.debug(`[SMS mock] send to ${input.phoneNumber}, outId=${outId}, code=123456`);
      return { outId };
    }

    if (!this.isConfigured()) {
      throw new Error('短信服务未配置：请设置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET（或 ALIYUN_SMS_*）');
    }

    const sms = this.config.get('sms') as {
      signName: string;
      templateCode: string;
    };

    const request = new SendSmsVerifyCodeRequest({
      signName: sms.signName,
      templateCode: sms.templateCode,
      templateParam: JSON.stringify({
        code: '##code##',
        min: String(input.codeMinutes),
      }),
      phoneNumber: input.phoneNumber,
      outId,
      codeType: 1,
      codeLength: 6,
      validTime: input.codeMinutes * 60,
    });

    const runtime = new RuntimeOptions({});
    const resp = await this.getClient().sendSmsVerifyCodeWithOptions(request, runtime);
    const body = resp.body as Record<string, unknown> | undefined;
    const code = String(body?.code ?? body?.Code ?? '');
    if (code !== 'OK') {
      const message = String(body?.message ?? body?.Message ?? '发送验证码失败');
      this.logger.warn(`SendSmsVerifyCode failed: ${code} ${message}`);
      throw new Error(message);
    }

    return { outId };
  }

  async checkVerifyCode(input: {
    phoneNumber: string;
    verifyCode: string;
    outId: string;
  }): Promise<boolean> {
    if (this.isMockMode()) {
      const ok = input.verifyCode === '123456';
      if (!ok) {
        this.logger.debug(`[SMS mock] verify failed for ${input.phoneNumber}`);
      }
      return ok;
    }

    if (!this.isConfigured()) {
      throw new Error('短信服务未配置：请设置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET（或 ALIYUN_SMS_*）');
    }

    const request = new CheckSmsVerifyCodeRequest({
      phoneNumber: input.phoneNumber,
      verifyCode: input.verifyCode,
      outId: input.outId,
    });

    const runtime = new RuntimeOptions({});
    const resp = await this.getClient().checkSmsVerifyCodeWithOptions(request, runtime);
    const body = resp.body as Record<string, unknown> | undefined;
    const code = String(body?.code ?? body?.Code ?? '');
    if (code !== 'OK') {
      const message = String(body?.message ?? body?.Message ?? '验证码校验失败');
      this.logger.debug(`CheckSmsVerifyCode failed: ${code} ${message}`);
      return false;
    }

    const model = (body?.model ?? body?.Model) as Record<string, unknown> | undefined;
    const verifyResult = String(model?.verifyResult ?? model?.VerifyResult ?? '');
    return verifyResult === 'PASS' || verifyResult === '1' || verifyResult === 'true';
  }
}
