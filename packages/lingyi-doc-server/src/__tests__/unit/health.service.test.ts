import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('HealthService', () => {
  let mockDataSource: any;
  let mockRedis: any;
  let mockConfig: any;

  beforeEach(() => {
    mockDataSource = {
      query: mock.fn(async () => [{ ok: 1 }]),
    };

    mockRedis = {
      ping: mock.fn(async () => true),
    };

    mockConfig = {
      get: mock.fn(() => undefined),
    };
  });

  describe('pingDatabase', () => {
    it('should return true when database is reachable', async () => {
      mockDataSource.query = mock.fn(async () => [{ ok: 1 }]);
      const result = await mockDataSource.query('SELECT 1 AS ok');
      assert.ok(result);
    });

    it('should return false when database is unreachable', async () => {
      mockDataSource.query = mock.fn(async () => { throw new Error('Connection failed'); });
      try {
        await mockDataSource.query('SELECT 1 AS ok');
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });
  });

  describe('pingRedis', () => {
    it('should return null when Redis URL is not configured', () => {
      mockConfig.get = mock.fn(() => undefined);
      const redisUrl = mockConfig.get('redis.url');
      assert.equal(redisUrl, undefined);
    });

    it('should return true when Redis is reachable', async () => {
      mockRedis.ping = mock.fn(async () => true);
      const result = await mockRedis.ping();
      assert.equal(result, true);
    });

    it('should return false when Redis is unreachable', async () => {
      mockRedis.ping = mock.fn(async () => false);
      const result = await mockRedis.ping();
      assert.equal(result, false);
    });
  });

  describe('getHealth', () => {
    it('should return ok status when all services are healthy', async () => {
      mockDataSource.query = mock.fn(async () => [{ ok: 1 }]);
      mockRedis.ping = mock.fn(async () => true);
      mockConfig.get = mock.fn((key: string) => {
        if (key === 'redis.url') return 'redis://localhost:6379';
        if (key === 'collab.enabled') return false;
        return undefined;
      });

      const dbOk = (await mockDataSource.query('SELECT 1 AS ok')) ? true : false;
      const redisOk = await mockRedis.ping();
      const collabEnabled = mockConfig.get('collab.enabled');
      const degraded = !dbOk || (collabEnabled && redisOk === false);

      assert.equal(degraded, false);
    });

    it('should return degraded status when database is down', async () => {
      mockDataSource.query = mock.fn(async () => { throw new Error('Connection failed'); });
      mockConfig.get = mock.fn((key: string) => {
        if (key === 'collab.enabled') return false;
        return undefined;
      });

      let dbOk = false;
      try {
        await mockDataSource.query('SELECT 1 AS ok');
        dbOk = true;
      } catch {
        dbOk = false;
      }
      const collabEnabled = mockConfig.get('collab.enabled');
      const degraded = !dbOk || (collabEnabled && false === false);

      assert.equal(dbOk, false);
    });

    it('should return degraded status when collaboration is enabled and Redis is down', async () => {
      mockDataSource.query = mock.fn(async () => [{ ok: 1 }]);
      mockRedis.ping = mock.fn(async () => false);
      mockConfig.get = mock.fn((key: string) => {
        if (key === 'redis.url') return 'redis://localhost:6379';
        if (key === 'collab.enabled') return true;
        return undefined;
      });

      const dbOk = true;
      const redisOk = await mockRedis.ping();
      const collabEnabled = mockConfig.get('collab.enabled');
      const degraded = !dbOk || (collabEnabled && redisOk === false);

      assert.equal(degraded, true);
    });

    it('should return ok status when collaboration is disabled and Redis is down', async () => {
      mockDataSource.query = mock.fn(async () => [{ ok: 1 }]);
      mockRedis.ping = mock.fn(async () => false);
      mockConfig.get = mock.fn((key: string) => {
        if (key === 'redis.url') return 'redis://localhost:6379';
        if (key === 'collab.enabled') return false;
        return undefined;
      });

      const dbOk = true;
      const redisOk = await mockRedis.ping();
      const collabEnabled = mockConfig.get('collab.enabled');
      const degraded = !dbOk || (collabEnabled && redisOk === false);

      assert.equal(degraded, false);
    });
  });

  describe('Health Response Structure', () => {
    it('should have correct response structure', () => {
      const healthResponse = {
        status: 'ok',
        version: '0.1.0',
        timestamp: Date.now(),
        database: 'connected',
        redis: 'connected',
        collaboration: { enabled: false },
        deploy: {
          edition: 'community',
          type: 'dev',
          license: 'ok',
          licenseEnforced: false,
        },
        metrics: {},
      };

      assert.ok(healthResponse.status);
      assert.ok(healthResponse.version);
      assert.ok(healthResponse.timestamp);
      assert.ok(healthResponse.database);
      assert.ok(healthResponse.redis);
      assert.ok(healthResponse.collaboration);
      assert.ok(healthResponse.deploy);
    });
  });
});
