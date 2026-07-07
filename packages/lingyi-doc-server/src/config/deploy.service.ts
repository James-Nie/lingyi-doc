import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountMode, DeployType } from '../types/deploy';

@Injectable()
export class DeployService {
  constructor(private readonly config: ConfigService) {}

  get type(): DeployType {
    const v = Number(this.config.get<number>('deploy.type', 1));
    if (v === 2 || v === 3) return v;
    return 1;
  }

  get accountMode(): AccountMode {
    return Number(this.config.get<number>('deploy.accountMode', 1)) === 2 ? 2 : 1;
  }

  get defaultTenantId(): string | null {
    const id = this.config.get<string>('deploy.defaultTenantId', '');
    return id || null;
  }

  get defaultTenantName(): string {
    return this.config.get<string>('deploy.defaultTenantName', '默认企业');
  }

  get allowMultiTenantSwitch(): boolean {
    if (this.isPrivate()) return false;
    return this.config.get<boolean>('deploy.allowMultiTenantSwitch', true);
  }

  get enforceTenantFilter(): boolean {
    return this.config.get<boolean>('deploy.enforceTenantFilter', true);
  }

  isSaas(): boolean {
    return this.type === 1;
  }

  isPrivate(): boolean {
    return this.type === 2 || this.type === 3;
  }

  canCreateTenant(): boolean {
    return this.isSaas();
  }

  defaultUserSource(): 1 | 2 {
    return this.isPrivate() ? 2 : 1;
  }
}
