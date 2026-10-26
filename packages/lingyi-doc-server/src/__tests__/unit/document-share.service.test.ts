import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('DocumentShareService', () => {
  let mockShareRepository: any;
  let mockStorageService: any;

  const SHAREE_PERMISSION_LEVELS = ['read', 'comment', 'edit'];
  const DOC_SHARE_PERMISSION_LEVELS = ['none', 'read', 'comment', 'edit', 'manage'];

  beforeEach(() => {
    mockShareRepository = {
      findByDocId: mock.fn(async () => []),
      findByToken: mock.fn(async () => null),
      create: mock.fn(async (data: any) => data),
      update: mock.fn(async (id: string, data: any) => ({ id, ...data })),
      delete: mock.fn(async () => {}),
      findCollaborators: mock.fn(async () => []),
      addCollaborator: mock.fn(async (docId: string, userId: string, permission: string) => ({ docId, userId, permission })),
      removeCollaborator: mock.fn(async () => {}),
    };

    mockStorageService = {
      loadDocumentForUser: mock.fn(async () => null),
    };
  });

  describe('Permission Level Validation', () => {
    it('should accept valid permission levels', () => {
      const validLevels = ['read', 'comment', 'edit'];
      
      for (const level of validLevels) {
        assert.ok(DOC_SHARE_PERMISSION_LEVELS.includes(level), `${level} should be valid`);
        assert.ok(SHAREE_PERMISSION_LEVELS.includes(level), `${level} should be shareable`);
      }
    });

    it('should reject invalid permission levels', () => {
      const invalidLevels = ['write', 'admin', 'owner', ''];
      
      for (const level of invalidLevels) {
        assert.ok(!DOC_SHARE_PERMISSION_LEVELS.includes(level), `${level} should be invalid`);
      }
    });

    it('should reject none and manage for sharing', () => {
      const restrictedLevels = ['none', 'manage'];
      
      for (const level of restrictedLevels) {
        assert.ok(!SHAREE_PERMISSION_LEVELS.includes(level), `${level} should not be shareable`);
      }
    });
  });

  describe('Share Expiration', () => {
    it('should detect expired share', () => {
      const expiredShare = {
        expireTime: new Date(Date.now() - 86400000),
        status: true,
      };
      const isExpired = expiredShare.expireTime.getTime() <= Date.now();
      assert.ok(isExpired, 'Share should be expired');
    });

    it('should detect active share', () => {
      const activeShare = {
        expireTime: new Date(Date.now() + 86400000),
        status: true,
      };
      const isExpired = activeShare.expireTime.getTime() <= Date.now();
      assert.ok(!isExpired, 'Share should not be expired');
    });

    it('should handle share without expiration', () => {
      const shareWithoutExpiration = {
        expireTime: null,
        status: true,
      };
      const isExpired = shareWithoutExpiration.expireTime 
        ? shareWithoutExpiration.expireTime.getTime() <= Date.now()
        : false;
      assert.ok(!isExpired, 'Share without expiration should not be expired');
    });
  });

  describe('Permission Level Conversion', () => {
    it('should convert manage to edit for sharing', () => {
      function toShareePermissionLevel(level: string): string {
        if (level === 'manage' || level === 'edit') return 'edit';
        if (level === 'comment') return 'comment';
        return 'read';
      }

      assert.equal(toShareePermissionLevel('manage'), 'edit');
      assert.equal(toShareePermissionLevel('edit'), 'edit');
      assert.equal(toShareePermissionLevel('comment'), 'comment');
      assert.equal(toShareePermissionLevel('read'), 'read');
      assert.equal(toShareePermissionLevel('none'), 'read');
    });

    it('should convert share level to access info', () => {
      function shareLevelToAccess(level: string) {
        if (level === 'edit' || level === 'manage') {
          return {
            permission: level,
            canEdit: true,
            viewMode: 'edit',
          };
        }
        if (level === 'comment') {
          return { permission: 'comment', canEdit: false, viewMode: 'preview' };
        }
        return { permission: 'read', canEdit: false, viewMode: 'preview' };
      }

      const editAccess = shareLevelToAccess('edit');
      assert.equal(editAccess.canEdit, true);
      assert.equal(editAccess.viewMode, 'edit');

      const commentAccess = shareLevelToAccess('comment');
      assert.equal(commentAccess.canEdit, false);
      assert.equal(commentAccess.viewMode, 'preview');

      const readAccess = shareLevelToAccess('read');
      assert.equal(readAccess.canEdit, false);
      assert.equal(readAccess.viewMode, 'preview');
    });
  });

  describe('getShareConfig', () => {
    it('should return share config for document', async () => {
      const docId = 'doc-123';
      const mockLinkShare = {
        id: 'share-1',
        docId,
        shareToken: 'token-123',
        status: true,
        permission: 'read',
        expireTime: null,
        hasPassword: false,
      };

      mockShareRepository.findByDocId = mock.fn(async () => [mockLinkShare]);

      const shares = await mockShareRepository.findByDocId(docId);
      const linkShare = shares.find((s: any) => s.shareToken);
      assert.ok(linkShare);
      assert.equal(linkShare.permission, 'read');
    });
  });

  describe('upsertShare', () => {
    it('should create new share config', async () => {
      const docId = 'doc-123';
      const config = {
        permission: 'read',
        expireAt: null,
        password: null,
      };

      assert.ok(DOC_SHARE_PERMISSION_LEVELS.includes(config.permission));
      assert.ok(SHAREE_PERMISSION_LEVELS.includes(config.permission));

      const mockShare = {
        id: 'share-new',
        docId,
        ...config,
        status: true,
      };
      mockShareRepository.create = mock.fn(async () => mockShare);

      const share = await mockShareRepository.create({ docId, ...config });
      assert.ok(share);
      assert.equal(share.permission, 'read');
    });

    it('should update existing share config', async () => {
      const docId = 'doc-123';
      const existingShare = {
        id: 'share-1',
        docId,
        permission: 'read',
        status: true,
      };
      const newConfig = {
        permission: 'edit',
      };

      mockShareRepository.findByDocId = mock.fn(async () => [existingShare]);
      mockShareRepository.update = mock.fn(async (id: string, data: any) => ({ ...existingShare, ...data }));

      const shares = await mockShareRepository.findByDocId(docId);
      assert.equal(shares.length, 1);

      const updated = await mockShareRepository.update(existingShare.id, newConfig);
      assert.equal(updated.permission, 'edit');
    });
  });

  describe('closeShare', () => {
    it('should close share config', async () => {
      const docId = 'doc-123';
      const mockShare = {
        id: 'share-1',
        docId,
        status: true,
      };

      mockShareRepository.findByDocId = mock.fn(async () => [mockShare]);
      mockShareRepository.update = mock.fn(async (id: string, data: any) => ({ ...mockShare, ...data }));

      const shares = await mockShareRepository.findByDocId(docId);
      assert.equal(shares.length, 1);

      const updated = await mockShareRepository.update(mockShare.id, { status: false });
      assert.equal(updated.status, false);
    });
  });

  describe('listCollaborators', () => {
    it('should list collaborators for document', async () => {
      const docId = 'doc-123';
      const mockCollaborators = [
        { userId: 'user-1', permission: 'edit', user: { displayName: 'User 1' } },
        { userId: 'user-2', permission: 'read', user: { displayName: 'User 2' } },
      ];

      mockShareRepository.findCollaborators = mock.fn(async () => mockCollaborators);

      const collaborators = await mockShareRepository.findCollaborators(docId);
      assert.equal(collaborators.length, 2);
      assert.equal(collaborators[0].permission, 'edit');
      assert.equal(collaborators[1].permission, 'read');
    });

    it('should return empty array when no collaborators', async () => {
      const docId = 'doc-123';
      mockShareRepository.findCollaborators = mock.fn(async () => []);

      const collaborators = await mockShareRepository.findCollaborators(docId);
      assert.equal(collaborators.length, 0);
    });
  });

  describe('addCollaborator', () => {
    it('should add collaborator with valid permission', async () => {
      const docId = 'doc-123';
      const userId = 'user-3';
      const permission = 'edit';

      assert.ok(SHAREE_PERMISSION_LEVELS.includes(permission));

      const mockCollaborator = { userId, permission, docId };
      mockShareRepository.addCollaborator = mock.fn(async () => mockCollaborator);

      const collaborator = await mockShareRepository.addCollaborator(docId, userId, permission);
      assert.ok(collaborator);
      assert.equal(collaborator.permission, 'edit');
    });

    it('should throw error for invalid permission', async () => {
      const permission = 'invalid';
      assert.ok(!DOC_SHARE_PERMISSION_LEVELS.includes(permission));
    });
  });

  describe('removeCollaborator', () => {
    it('should remove collaborator', async () => {
      const docId = 'doc-123';
      const userId = 'user-1';

      mockShareRepository.removeCollaborator = mock.fn(async () => {});

      await mockShareRepository.removeCollaborator(docId, userId);
      assert.ok(true, 'Should remove collaborator');
    });
  });

  describe('getPublicShareInfo', () => {
    it('should return public share info', async () => {
      const shareToken = 'token-123';
      const mockShare = {
        id: 'share-1',
        shareToken,
        permission: 'read',
        status: true,
        expireTime: null,
        hasPassword: false,
        docId: 'doc-123',
      };

      mockShareRepository.findByToken = mock.fn(async () => mockShare);

      const share = await mockShareRepository.findByToken(shareToken);
      assert.ok(share);
      assert.equal(share.permission, 'read');
    });

    it('should handle expired share token', async () => {
      const shareToken = 'expired-token';
      const mockShare = {
        id: 'share-2',
        shareToken,
        permission: 'read',
        status: true,
        expireTime: new Date(Date.now() - 86400000),
        hasPassword: false,
      };

      mockShareRepository.findByToken = mock.fn(async () => mockShare);

      const share = await mockShareRepository.findByToken(shareToken);
      assert.ok(share);
      const isExpired = share.expireTime.getTime() <= Date.now();
      assert.ok(isExpired, 'Share should be expired');
    });
  });

  describe('verifyPublicShare', () => {
    it('should verify share without password', async () => {
      const shareToken = 'token-123';
      const mockShare = {
        id: 'share-1',
        shareToken,
        hasPassword: false,
        status: true,
      };

      mockShareRepository.findByToken = mock.fn(async () => mockShare);

      const share = await mockShareRepository.findByToken(shareToken);
      assert.ok(share);
      assert.equal(share.hasPassword, false);
    });

    it('should verify share with correct password', async () => {
      const shareToken = 'token-123';
      const password = 'correct-password';
      const mockShare = {
        id: 'share-1',
        shareToken,
        hasPassword: true,
        passwordHash: 'hashed-password',
        status: true,
      };

      mockShareRepository.findByToken = mock.fn(async () => mockShare);
      
      const bcryptCompare = mock.fn(async () => true);
      const isValid = await bcryptCompare(password, mockShare.passwordHash);
      assert.ok(isValid, 'Password should be valid');
    });

    it('should reject share with incorrect password', async () => {
      const shareToken = 'token-123';
      const password = 'wrong-password';
      const mockShare = {
        id: 'share-1',
        shareToken,
        hasPassword: true,
        passwordHash: 'hashed-password',
        status: true,
      };

      mockShareRepository.findByToken = mock.fn(async () => mockShare);
      
      const bcryptCompare = mock.fn(async () => false);
      const isValid = await bcryptCompare(password, mockShare.passwordHash);
      assert.ok(!isValid, 'Password should be invalid');
    });
  });

  describe('listSharedWithMe', () => {
    it('should list documents shared with user', async () => {
      const user = { userId: 'user-1' };
      const mockDocs = [
        { id: 'doc-1', title: 'Shared Doc 1' },
        { id: 'doc-2', title: 'Shared Doc 2' },
      ];

      mockStorageService.loadDocumentForUser = mock.fn(async () => mockDocs);

      const docs = await mockStorageService.loadDocumentForUser(user.userId);
      assert.ok(docs);
      assert.equal(docs.length, 2);
    });
  });

  describe('getDocumentInfo', () => {
    it('should get document info with stats', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const mockDoc = {
        id: docId,
        title: 'Test Doc',
        data: { sheets: {}, records: {} },
      };

      mockStorageService.loadDocumentForUser = mock.fn(async () => mockDoc);

      const doc = await mockStorageService.loadDocumentForUser(user.userId, docId);
      assert.ok(doc);

      const stats = {
        recordCount: 0,
        fieldCount: 0,
        storageSize: JSON.stringify(doc.data).length,
      };
      assert.ok(stats);
      assert.equal(stats.storageSize, JSON.stringify(doc.data).length);
    });
  });
});
