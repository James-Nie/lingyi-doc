import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly keyPrefix: string;

  constructor(private readonly config: ConfigService) {
    this.keyPrefix = this.config.get<string>('redis.keyPrefix', 'lingyi_doc:');
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('redis.url');
    if (!url) {
      this.logger.warn('REDIS_URL not configured, Redis features disabled');
      return;
    }

    const connectTimeout = this.config.get<number>('redis.connectTimeoutMs', 5000);
    const options = {
      connectTimeout,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    try {
      this.client = new Redis(url, options);
      this.subscriber = new Redis(url, options);
      await this.client.connect();
      await this.subscriber.connect();
      this.logger.log(`Redis connected: ${url}`);
    } catch (err) {
      this.logger.error('Redis connection failed', err);
      this.client = null;
      this.subscriber = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit();
    await this.client?.quit();
  }

  isReady(): boolean {
    return this.client?.status === 'ready';
  }

  key(raw: string): string {
    return `${this.keyPrefix}${raw}`;
  }

  getClient(): Redis | null {
    return this.client;
  }

  getSubscriber(): Redis | null {
    return this.subscriber;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client) return;
    await this.client.hset(this.key(key), field, value);
  }

  async hdel(key: string, field: string): Promise<void> {
    if (!this.client) return;
    await this.client.hdel(this.key(key), field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    return this.client.hgetall(this.key(key));
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(this.key(key));
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    if (!this.client) return;
    await this.client.setex(this.key(key), ttlSec, value);
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(this.key(key));
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    if (!this.client) return;
    await this.client.expire(this.key(key), ttlSec);
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) return;
    await this.client.publish(this.key(channel), message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    if (!this.subscriber) return;
    const fullChannel = this.key(channel);
    await this.subscriber.subscribe(fullChannel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === fullChannel) handler(message);
    });
  }
}
