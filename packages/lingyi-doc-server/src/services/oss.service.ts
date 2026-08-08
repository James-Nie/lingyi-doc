import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import { buildSignedAccessUrl } from '../utils/ossAccess';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

@Injectable()
export class OssService {
  private client: OSS | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('oss.enabled', true)
      && Boolean(this.config.get<string>('oss.accessKeyId'))
      && Boolean(this.config.get<string>('oss.accessKeySecret'))
      && Boolean(this.config.get<string>('oss.bucket'));
  }

  getClient(): OSS {
    if (!this.isEnabled()) {
      throw new Error('OSS 未配置');
    }
    if (!this.client) {
      this.client = new OSS({
        region: this.config.get<string>('oss.region', 'cn-hangzhou'),
        accessKeyId: this.config.get<string>('oss.accessKeyId', ''),
        accessKeySecret: this.config.get<string>('oss.accessKeySecret', ''),
        bucket: this.config.get<string>('oss.bucket', ''),
        endpoint: this.config.get<string>('oss.endpoint', 'oss-cn-hangzhou.aliyuncs.com'),
        secure: true,
      });
    }
    return this.client;
  }

  buildObjectKey(parts: string[]): string {
    const prefix = (this.config.get<string>('oss.prefix', 'dev') || '').replace(/^\/+|\/+$/g, '');
    const segments = [...(prefix ? [prefix] : []), ...parts.map((p) => p.replace(/^\/+|\/+$/g, ''))];
    return segments.filter(Boolean).join('/');
  }

  getPublicUrl(objectKey: string): string {
    const base = this.buildPublicBaseUrl();
    if (!base) return objectKey;
    return `${base}/${objectKey.replace(/^\/+/, '')}`;
  }

  private buildPublicBaseUrl(): string {
    const publicBaseUrl = this.config.get<string>('oss.publicBaseUrl', '');
    if (publicBaseUrl) {
      return normalizeBaseUrl(publicBaseUrl);
    }
    const bucket = this.config.get<string>('oss.bucket', '');
    const endpoint = this.config.get<string>('oss.endpoint', '');
    if (bucket && endpoint) {
      return `https://${bucket}.${endpoint}`;
    }
    return '';
  }

  /** 返回前端可用的访问 URL（私有 Bucket 走签名代理） */
  getAccessUrl(objectKey: string): string {
    if (this.config.get<string>('oss.accessMode', 'private') === 'public') {
      return this.getPublicUrl(objectKey);
    }
    return buildSignedAccessUrl(objectKey, this.config);
  }

  async getObjectStream(objectKey: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType?: string;
    contentLength?: number;
  }> {
    const client = this.getClient();
    const result = await client.getStream(objectKey);
    const headers = result.res?.headers as Record<string, string | number | undefined> | undefined;
    const contentType = headers?.['content-type'] as string | undefined;
    const contentLength = headers?.['content-length'] != null
      ? Number(headers['content-length'])
      : undefined;
    return { stream: result.stream, contentType, contentLength };
  }

  async putObject(objectKey: string, body: Buffer, mimeType?: string): Promise<string> {
    const client = this.getClient();
    const options: OSS.PutObjectOptions = {};
    if (mimeType) options.mime = mimeType;
    const acl = (this.config.get<string>('oss.objectAcl', '') || '').trim();
    if (acl) {
      options.headers = { 'x-oss-object-acl': acl };
    }
    await client.put(objectKey, body, options);
    return this.getAccessUrl(objectKey);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const client = this.getClient();
    await client.delete(objectKey);
  }

  /** 查询 OSS 对象大小（字节），失败时返回 null */
  async headObjectSize(objectKey: string): Promise<number | null> {
    if (!this.isEnabled()) return null;
    try {
      const result = await this.getClient().head(objectKey);
      const headers = result.res?.headers as Record<string, string | number | undefined> | undefined;
      const raw = headers?.['content-length'];
      const size = raw != null ? Number(raw) : NaN;
      return Number.isFinite(size) && size > 0 ? size : null;
    } catch {
      return null;
    }
  }
}
