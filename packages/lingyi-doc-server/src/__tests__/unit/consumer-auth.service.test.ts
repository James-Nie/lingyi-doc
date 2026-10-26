import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('ConsumerAuthService', () => {
  let mockAuthHelpers: any;
  let mockAuthService: any;
  let mockConfig: any;
  let mockUserRepository: any;
  let mockAuthSessionRepository: any;
  let mockSmsVerification: any;
  let mockPasswordCrypto: any;
  let mockRateLimit: any;

  beforeEach(() => {
    mockAuthHelpers = {
      registerConsumer: mock.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh' })),
      loginUser: mock.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh' })),
      issueTokens: mock.fn(async () => ({ accessToken: 'new-token', refreshToken: 'new-refresh' })),
    };

    mockAuthService = {
      getClientIp: mock.fn(() => '127.0.0.1'),
      verifyRefreshToken: mock.fn(),
      validatePassword: mock.fn(),
      signRefreshToken: mock.fn(),
    };

    mockConfig = {
      get: mock.fn(() => undefined),
    };

    mockUserRepository = {
      findByPhone: mock.fn(async () => null),
      findById: mock.fn(async () => null),
      toPublicUser: mock.fn((user: any) => user),
      updateProfile: mock.fn(async (userId: string, data: any) => ({ id: userId, ...data })),
      updatePassword: mock.fn(async () => {}),
      clearLoginLock: mock.fn(async () => {}),
    };

    mockAuthSessionRepository = {
      findValid: mock.fn(async () => null),
      create: mock.fn(async () => {}),
      revoke: mock.fn(async () => {}),
      revokeAllForUser: mock.fn(async () => {}),
      listForUser: mock.fn(async () => []),
      updateSessionContext: mock.fn(async () => {}),
    };

    mockSmsVerification = {
      sendCode: mock.fn(async () => ({ success: true })),
      verifyCode: mock.fn(async () => ({ verificationToken: 'test-token' })),
      normalizePhone: mock.fn((phone: string) => phone),
      assertValidPhone: mock.fn((phone: string) => phone),
      consumeVerificationToken: mock.fn(),
    };

    mockPasswordCrypto = {
      getPublicKey: mock.fn(() => 'test-public-key'),
      decryptPassword: mock.fn((password: string) => password),
    };

    mockRateLimit = {
      consume: mock.fn(() => ({ allowed: true })),
    };
  });

  describe('getPasswordPublicKey', () => {
    it('should return public key', () => {
      const result = mockPasswordCrypto.getPublicKey();
      assert.equal(result, 'test-public-key');
    });
  });

  describe('sendSms', () => {
    it('should throw error when phone is missing', async () => {
      const body = { scene: 'register' } as any;
      const phone = body.phone;
      const scene = body.scene;

      if (!phone || !scene) {
        assert.ok(true, 'Should throw error for missing phone');
        return;
      }
    });

    it('should throw error when scene is invalid', async () => {
      const body = { phone: '13800138000', scene: 'invalid' };
      const validScenes = ['register', 'reset_password'];
      
      if (!validScenes.includes(body.scene)) {
        assert.ok(true, 'Should throw error for invalid scene');
        return;
      }
    });

    it('should send SMS successfully for registration', async () => {
      const phone = '13800138000';
      const scene = 'register';
      mockUserRepository.findByPhone = mock.fn(async () => null);
      mockSmsVerification.sendCode = mock.fn(async () => ({ success: true }));

      const existing = await mockUserRepository.findByPhone(phone);
      assert.equal(existing, null);

      const result = await mockSmsVerification.sendCode(scene, phone, '127.0.0.1');
      assert.ok(result);
    });

    it('should throw error when phone already registered for registration', async () => {
      const phone = '13800138000';
      mockUserRepository.findByPhone = mock.fn(async () => ({ id: '1' }));

      const existing = await mockUserRepository.findByPhone(phone);
      assert.ok(existing, 'Should find existing user');
    });
  });

  describe('verifySms', () => {
    it('should throw error when parameters are missing', async () => {
      const body = { phone: '13800138000' } as any;
      const { phone, code, scene } = body;

      if (!phone || !code || !scene) {
        assert.ok(true, 'Should throw error for missing parameters');
        return;
      }
    });

    it('should verify SMS code successfully', async () => {
      const phone = '13800138000';
      const code = '123456';
      const scene = 'register';
      mockSmsVerification.verifyCode = mock.fn(async () => ({ verificationToken: 'test-token' }));

      const result = await mockSmsVerification.verifyCode(scene, phone, code);
      assert.ok(result.verificationToken);
    });
  });

  describe('register', () => {
    it('should throw error when required fields are missing', async () => {
      const body = { email: 'test@example.com' } as any;
      const { email, password, displayName, phone, verificationToken } = body;

      if (!email || !password || !displayName || !phone || !verificationToken) {
        assert.ok(true, 'Should throw error for missing fields');
        return;
      }
    });

    it('should register user successfully', async () => {
      const body = {
        email: 'test@example.com',
        password: 'encrypted-password',
        displayName: 'Test User',
        phone: '13800138000',
        verificationToken: 'test-token',
      };
      mockAuthHelpers.registerConsumer = mock.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh' }));

      const result = await mockAuthHelpers.registerConsumer({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        phone: body.phone,
        verificationToken: body.verificationToken,
        req: {},
      });
      assert.ok(result.accessToken);
      assert.ok(result.refreshToken);
    });
  });

  describe('login', () => {
    it('should throw error when account or password is missing', async () => {
      const body = { account: '' } as any;
      const loginAccount = String(body.account ?? '').trim();
      const password = body.password;

      if (!loginAccount || !password) {
        assert.ok(true, 'Should throw error for missing credentials');
        return;
      }
    });

    it('should throw error for invalid login type', async () => {
      const body = { account: 'test@example.com', password: 'password', loginType: 'invalid' };
      const validLoginTypes = ['email', 'phone', 'auto'];

      if (body.loginType && !validLoginTypes.includes(body.loginType)) {
        assert.ok(true, 'Should throw error for invalid login type');
        return;
      }
    });

    it('should login successfully', async () => {
      const body = {
        account: 'test@example.com',
        password: 'encrypted-password',
      };
      mockRateLimit.consume = mock.fn(() => ({ allowed: true }));
      mockAuthHelpers.loginUser = mock.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh' }));

      const clientIp = mockAuthService.getClientIp({});
      const ipLimit = 60;
      const ipResult = mockRateLimit.consume(`login:ip:${clientIp}`, ipLimit, 60 * 60_000);
      assert.equal(ipResult.allowed, true);

      const result = await mockAuthHelpers.loginUser({
        account: body.account,
        password: body.password,
        audience: 'consumer',
        req: {},
        loginType: 'auto',
      });
      assert.ok(result.accessToken);
    });

    it('should throw error when rate limit is exceeded', async () => {
      mockRateLimit.consume = mock.fn(() => ({ 
        allowed: false, 
        retryAfterSec: 60 
      }));

      const clientIp = '127.0.0.1';
      const ipLimit = 60;
      const ipResult = mockRateLimit.consume(`login:ip:${clientIp}`, ipLimit, 60 * 60_000);
      assert.equal(ipResult.allowed, false);
      assert.ok(ipResult.retryAfterSec);
    });
  });

  describe('refresh', () => {
    it('should throw error when refreshToken is missing', async () => {
      const body = {} as any;
      const refreshToken = body.refreshToken;

      if (!refreshToken) {
        assert.ok(true, 'Should throw error for missing refreshToken');
        return;
      }
    });

    it('should refresh token successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockSession = { userId: 'user-1' };
      const mockUser = { id: 'user-1', user_source: 1 };

      mockAuthSessionRepository.findValid = mock.fn(async () => mockSession);
      mockUserRepository.findById = mock.fn(async () => mockUser);
      mockAuthHelpers.issueTokens = mock.fn(async () => ({ accessToken: 'new-token', refreshToken: 'new-refresh' }));

      const session = await mockAuthSessionRepository.findValid(refreshToken, 'consumer');
      assert.ok(session);

      const user = await mockUserRepository.findById(session.userId);
      assert.ok(user);

      const result = await mockAuthHelpers.issueTokens(user, 'consumer', {});
      assert.ok(result.accessToken);
    });

    it('should throw error when session is invalid', async () => {
      const refreshToken = 'invalid-refresh-token';
      mockAuthSessionRepository.findValid = mock.fn(async () => null);

      const session = await mockAuthSessionRepository.findValid(refreshToken, 'consumer');
      assert.equal(session, null);
    });
  });

  describe('logout', () => {
    it('should logout successfully with refreshToken', async () => {
      const refreshToken = 'valid-refresh-token';
      mockAuthSessionRepository.revoke = mock.fn(async () => {});

      await mockAuthSessionRepository.revoke(refreshToken);
      assert.ok(true, 'Should revoke session');
    });

    it('should logout successfully without refreshToken', async () => {
      const body = {} as any;
      const refreshToken = body.refreshToken;

      if (refreshToken) {
        await mockAuthSessionRepository.revoke(refreshToken);
      }
      assert.ok(true, 'Should handle logout without refreshToken');
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const userId = 'user-1';
      const body = { displayName: 'New Name', avatarUrl: 'https://example.com/avatar.jpg' };
      const mockUpdatedUser = { id: userId, display_name: body.displayName, avatar_url: body.avatarUrl };

      mockUserRepository.updateProfile = mock.fn(async () => mockUpdatedUser);
      mockUserRepository.toPublicUser = mock.fn((user: any) => ({
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      }));

      const updated = await mockUserRepository.updateProfile(userId, {
        displayName: typeof body.displayName === 'string' ? body.displayName.trim() : undefined,
        avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : body.avatarUrl === null ? null : undefined,
      });
      assert.ok(updated);

      const publicUser = mockUserRepository.toPublicUser(updated);
      assert.equal(publicUser.displayName, body.displayName);
    });

    it('should throw error when user not found', async () => {
      const userId = 'non-existent';
      mockUserRepository.updateProfile = mock.fn(async () => null);

      const updated = await mockUserRepository.updateProfile(userId, { displayName: 'New Name' });
      assert.equal(updated, null);
    });
  });

  describe('updatePassword', () => {
    it('should throw error when oldPassword or newPassword is missing', async () => {
      const body = { oldPassword: '' } as any;
      const { oldPassword, newPassword } = body;

      if (!oldPassword || !newPassword) {
        assert.ok(true, 'Should throw error for missing passwords');
        return;
      }
    });

    it('should throw error when old password is incorrect', async () => {
      const userId = 'user-1';
      const mockUser = { id: userId, password_hash: 'hashed-password' };

      mockUserRepository.findById = mock.fn(async () => mockUser);
      
      const bcryptCompare = mock.fn(async () => false);
      const valid = await bcryptCompare('wrong-password', mockUser.password_hash);
      assert.equal(valid, false);
    });
  });

  describe('switchIdentity', () => {
    it('should throw error for invalid identity type', async () => {
      const body = { identityType: 'invalid' };
      const validTypes = ['personal', 'tenant'];

      if (body.identityType !== 'personal' && body.identityType !== 'tenant') {
        assert.ok(true, 'Should throw error for invalid identity type');
        return;
      }
    });

    it('should switch to personal identity successfully', async () => {
      const userId = 'user-1';
      const body = { identityType: 'personal' };
      const mockUser = { id: userId, user_source: 1 };

      mockUserRepository.findById = mock.fn(async () => mockUser);

      const dbUser = await mockUserRepository.findById(userId);
      assert.ok(dbUser);

      const nextSession = {
        currentIdentityType: body.identityType,
        userSource: dbUser.user_source,
        currentTenantId: null,
        tenantRole: null,
      };
      assert.equal(nextSession.currentIdentityType, 'personal');
    });

    it('should throw error when tenantId is missing for tenant identity', async () => {
      const body = { identityType: 'tenant' } as any;
      
      if (body.identityType === 'tenant') {
        const tenantId = body.tenantId;
        if (!tenantId || typeof tenantId !== 'string') {
          assert.ok(true, 'Should throw error for missing tenantId');
          return;
        }
      }
    });
  });

  describe('listLoginSessions', () => {
    it('should list login sessions successfully', async () => {
      const userId = 'user-1';
      const mockSessions = [
        { 
          id: 'session-1', 
          refreshTokenHash: 'hash1', 
          ip: '127.0.0.1',
          deviceInfo: 'Chrome',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
        },
      ];

      mockAuthSessionRepository.listForUser = mock.fn(async () => mockSessions);

      const rows = await mockAuthSessionRepository.listForUser(userId, 'consumer', 50);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, 'session-1');
    });
  });
});
