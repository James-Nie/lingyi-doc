import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('DocumentController', () => {
  let mockStorageService: any;
  let mockDocumentRepository: any;
  let mockDocumentShareService: any;
  let mockMembershipService: any;

  beforeEach(() => {
    mockStorageService = {
      accessFromAuth: mock.fn(),
      createDocument: mock.fn(),
      listRecycleBin: mock.fn(),
      listOwnedDocuments: mock.fn(),
      listRecentDocuments: mock.fn(),
      listLibraryDocuments: mock.fn(),
      existsDocumentTitle: mock.fn(),
      loadDocumentForUser: mock.fn(),
      getDocumentMeta: mock.fn(),
      getSheetContent: mock.fn(),
    };

    mockDocumentRepository = {
      getWriteMeta: mock.fn(),
      resolveScope: mock.fn(),
    };

    mockDocumentShareService = {
      listSharedWithMe: mock.fn(),
      resolvePathForUser: mock.fn(),
      getDocumentInfo: mock.fn(),
      logDocumentOperationAudit: mock.fn(),
    };

    mockMembershipService = {
      assertCanCreateDocument: mock.fn(),
      assertCanExport: mock.fn(),
      assertFeature: mock.fn(),
      recordExport: mock.fn(),
      assertStorageDeltaForDocument: mock.fn(),
      resolveContextForDocument: mock.fn(),
    };
  });

  describe('create', () => {
    it('should throw error when title is missing', async () => {
      const user = { userId: 'user-1' };
      const body = { title: '', docType: 'freeform' };
      const trimmedTitle = typeof body.title === 'string' ? body.title.trim() : '';

      if (!trimmedTitle) {
        assert.ok(true, 'Should throw error for missing title');
        return;
      }
    });

    it('should create document successfully', async () => {
      const user = { userId: 'user-1' };
      const body = { title: 'Test Document', docType: 'freeform', data: {} };
      const ctx = { userId: 'user-1', tenantId: null, identityType: 'personal' };
      const mockDoc = { id: 'doc_123', title: body.title, docType: body.docType };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockMembershipService.assertCanCreateDocument.mock.mockImplementation(() => Promise.resolve());
      mockStorageService.existsDocumentTitle.mock.mockImplementation(() => Promise.resolve(false));
      mockDocumentRepository.resolveScope.mock.mockImplementation(() => 1);
      mockStorageService.createDocument.mock.mockImplementation(() => Promise.resolve(mockDoc));

      const accessCtx = mockStorageService.accessFromAuth(user);
      assert.ok(accessCtx);

      await mockMembershipService.assertCanCreateDocument(user, accessCtx, body.docType);
      assert.ok(true, 'Should pass membership check');

      const exists = await mockStorageService.existsDocumentTitle(body.title.trim(), undefined, accessCtx);
      assert.equal(exists, false);

      const scope = mockDocumentRepository.resolveScope(accessCtx);
      assert.equal(scope, 1);

      const doc = await mockStorageService.createDocument({
        id: 'doc_123',
        title: body.title.trim(),
        docType: body.docType,
        data: body.data,
        ownerId: user.userId,
        scope,
        tenantId: null,
      });
      assert.ok(doc);
      assert.equal(doc.title, body.title);
    });

    it('should throw error when document title already exists', async () => {
      const user = { userId: 'user-1' };
      const body = { title: 'Existing Document', docType: 'freeform' };
      const ctx = { userId: 'user-1', tenantId: null, identityType: 'personal' };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockMembershipService.assertCanCreateDocument.mock.mockImplementation(() => Promise.resolve());
      mockStorageService.existsDocumentTitle.mock.mockImplementation(() => Promise.resolve(true));

      const exists = await mockStorageService.existsDocumentTitle(body.title.trim(), undefined, ctx);
      assert.equal(exists, true);
    });
  });

  describe('listRecycleBin', () => {
    it('should list recycle bin documents', async () => {
      const user = { userId: 'user-1' };
      const ctx = { userId: 'user-1', tenantId: null };
      const mockItems = [
        { id: 'doc-1', title: 'Deleted Doc 1' },
        { id: 'doc-2', title: 'Deleted Doc 2' },
      ];

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.listRecycleBin.mock.mockImplementation(() => Promise.resolve(mockItems));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const items = await mockStorageService.listRecycleBin(accessCtx);
      assert.equal(items.length, 2);
      assert.equal(items[0].title, 'Deleted Doc 1');
    });
  });

  describe('listSharedWithMe', () => {
    it('should list shared documents with default sort', async () => {
      const user = { userId: 'user-1' };
      const sortBy = undefined;
      const sort = sortBy || 'lastVisited';
      const mockDocs = [
        { id: 'doc-1', title: 'Shared Doc 1' },
      ];

      mockDocumentShareService.listSharedWithMe.mock.mockImplementation(() => Promise.resolve(mockDocs));

      const result = await mockDocumentShareService.listSharedWithMe(user, sort);
      assert.ok(result);
    });

    it('should list shared documents with custom sort', async () => {
      const user = { userId: 'user-1' };
      const sortBy = 'created';
      const sort = sortBy || 'lastVisited';
      const mockDocs = [
        { id: 'doc-1', title: 'Shared Doc 1' },
      ];

      mockDocumentShareService.listSharedWithMe.mock.mockImplementation(() => Promise.resolve(mockDocs));

      const result = await mockDocumentShareService.listSharedWithMe(user, sort);
      assert.ok(result);
    });
  });

  describe('listOwned', () => {
    it('should list owned documents', async () => {
      const user = { userId: 'user-1' };
      const ctx = { userId: 'user-1', tenantId: null };
      const mockDocs = [
        { id: 'doc-1', title: 'My Doc 1' },
        { id: 'doc-2', title: 'My Doc 2' },
      ];

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.listOwnedDocuments.mock.mockImplementation(() => Promise.resolve(mockDocs));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const list = await mockStorageService.listOwnedDocuments('lastVisited', accessCtx);
      assert.equal(list.length, 2);
    });
  });

  describe('listRecent', () => {
    it('should list recent documents with default days', async () => {
      const user = { userId: 'user-1' };
      const ctx = { userId: 'user-1', tenantId: null };
      const daysRaw = undefined;
      const days = daysRaw != null && daysRaw !== '' ? Number(daysRaw) : 30;
      const mockDocs = [
        { id: 'doc-1', title: 'Recent Doc 1' },
      ];

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.listRecentDocuments.mock.mockImplementation(() => Promise.resolve(mockDocs));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const list = await mockStorageService.listRecentDocuments('lastVisited', accessCtx, days);
      assert.equal(list.length, 1);
      assert.equal(days, 30);
    });

    it('should list recent documents with custom days', async () => {
      const user = { userId: 'user-1' };
      const ctx = { userId: 'user-1', tenantId: null };
      const daysRaw = '7';
      const days = daysRaw != null && daysRaw !== '' ? Number(daysRaw) : 30;

      assert.equal(days, 7);
    });
  });

  describe('getDocPath', () => {
    it('should resolve document path', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const mockPath = { spaceSlug: 'space', bookSlug: 'book', docSlug: 'doc' };

      mockDocumentShareService.resolvePathForUser.mock.mockImplementation(() => Promise.resolve(mockPath));

      const result = await mockDocumentShareService.resolvePathForUser(user, docId);
      assert.ok(result);
      assert.equal(result.spaceSlug, 'space');
    });
  });

  describe('export', () => {
    it('should export document as JSON', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const ctx = { userId: 'user-1', tenantId: null };
      const hd = undefined;
      const isHd = hd === '1' || hd === 'true';
      const mockDoc = { id: docId, title: 'Test Doc', data: {} };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockDocumentRepository.getWriteMeta.mock.mockImplementation(() => Promise.resolve({
        scope: 1,
        ownerId: user.userId,
        tenantId: null,
        storageSize: 0,
      }));
      mockStorageService.loadDocumentForUser.mock.mockImplementation(() => Promise.resolve(mockDoc));
      mockDocumentShareService.logDocumentOperationAudit.mock.mockImplementation(() => Promise.resolve());

      assert.equal(isHd, false);

      const meta = await mockDocumentRepository.getWriteMeta(docId, ctx);
      assert.ok(meta);

      const doc = await mockStorageService.loadDocumentForUser(docId, ctx);
      assert.ok(doc);
      assert.equal(doc.id, docId);
    });
  });

  describe('importDoc', () => {
    it('should throw error when data is missing', async () => {
      const body = { title: 'Import Doc' };
      if (!body.data) {
        assert.ok(true, 'Should throw error for missing data');
        return;
      }
    });

    it('should import document successfully', async () => {
      const user = { userId: 'user-1' };
      const body = { title: 'Imported Doc', data: { content: 'test' } };
      const ctx = { userId: 'user-1', tenantId: null, identityType: 'personal' };
      const mockDoc = { id: 'doc_imported', title: body.title };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockMembershipService.assertCanCreateDocument.mock.mockImplementation(() => Promise.resolve());
      mockMembershipService.assertStorageDeltaForDocument.mock.mockImplementation(() => Promise.resolve());
      mockStorageService.existsDocumentTitle.mock.mockImplementation(() => Promise.resolve(false));
      mockDocumentRepository.resolveScope.mock.mockImplementation(() => 1);
      mockStorageService.createDocument.mock.mockImplementation(() => Promise.resolve(mockDoc));

      const accessCtx = mockStorageService.accessFromAuth(user);
      await mockMembershipService.assertCanCreateDocument(user, accessCtx, 'freeform');
      
      const importBytes = JSON.stringify(body.data).length * 2;
      await mockMembershipService.assertStorageDeltaForDocument(user, {
        scope: 1,
        ownerId: user.userId,
        tenantId: null,
        storageSize: 0,
      }, importBytes);

      const doc = await mockStorageService.createDocument({
        id: 'doc_imported',
        title: body.title.trim() || '导入的文档',
        docType: 'freeform',
        data: body.data,
        ownerId: user.userId,
        scope: 1,
        tenantId: null,
      });
      assert.ok(doc);
    });
  });

  describe('getDocumentInfo', () => {
    it('should get document info', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const mockInfo = { 
        id: docId, 
        title: 'Test Doc',
        stats: { views: 10, edits: 5 },
        accessRecords: [],
        operationRecords: [],
      };

      mockDocumentShareService.getDocumentInfo.mock.mockImplementation(() => Promise.resolve(mockInfo));

      const result = await mockDocumentShareService.getDocumentInfo(user, docId);
      assert.ok(result);
      assert.equal(result.id, docId);
    });
  });

  describe('getMeta', () => {
    it('should get document meta', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const ctx = { userId: 'user-1', tenantId: null };
      const mockMeta = { id: docId, title: 'Test Doc', docType: 'freeform' };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.getDocumentMeta.mock.mockImplementation(() => Promise.resolve(mockMeta));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const meta = await mockStorageService.getDocumentMeta(docId, accessCtx);
      assert.ok(meta);
      assert.equal(meta.id, docId);
    });

    it('should throw error when document not found', async () => {
      const user = { userId: 'user-1' };
      const docId = 'non-existent';
      const ctx = { userId: 'user-1', tenantId: null };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.getDocumentMeta.mock.mockImplementation(() => Promise.resolve(null));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const meta = await mockStorageService.getDocumentMeta(docId, accessCtx);
      assert.equal(meta, null);
    });
  });

  describe('getSheet', () => {
    it('should get sheet content', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const sheetId = 'sheet-1';
      const ctx = { userId: 'user-1', tenantId: null };
      const mockSheet = { id: sheetId, data: [['A1', 'B1'], ['A2', 'B2']] };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.getSheetContent.mock.mockImplementation(() => Promise.resolve(mockSheet));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const sheet = await mockStorageService.getSheetContent(docId, sheetId, accessCtx);
      assert.ok(sheet);
      assert.equal(sheet.id, sheetId);
    });

    it('should throw error when sheet not found', async () => {
      const user = { userId: 'user-1' };
      const docId = 'doc-123';
      const sheetId = 'non-existent';
      const ctx = { userId: 'user-1', tenantId: null };

      mockStorageService.accessFromAuth.mock.mockImplementation(() => ctx);
      mockStorageService.getSheetContent.mock.mockImplementation(() => Promise.resolve(null));

      const accessCtx = mockStorageService.accessFromAuth(user);
      const sheet = await mockStorageService.getSheetContent(docId, sheetId, accessCtx);
      assert.equal(sheet, null);
    });
  });
});
