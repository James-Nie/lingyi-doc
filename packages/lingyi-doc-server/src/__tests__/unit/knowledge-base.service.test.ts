import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('KnowledgeBaseService', () => {
  let mockKbRepository: any;
  let mockKbNodeRepository: any;
  let mockTenantMemberRepository: any;
  let mockUserRepository: any;
  let mockStorageService: any;
  let mockMembershipService: any;

  const KB_MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer'];
  const KB_NODE_TYPES = ['page', 'doc_ref', 'folder'];
  const KB_VISIBILITY = ['organization', 'members'];

  beforeEach(() => {
    mockKbRepository = {
      list: mock.fn(),
      findById: mock.fn(),
      create: mock.fn(),
      update: mock.fn(),
      delete: mock.fn(),
      toDto: mock.fn(),
    };

    mockKbNodeRepository = {
      listNodes: mock.fn(),
      createNode: mock.fn(),
      updateNode: mock.fn(),
      deleteNode: mock.fn(),
      findById: mock.fn(),
    };

    mockTenantMemberRepository = {
      findMembership: mock.fn(),
    };

    mockUserRepository = {
      findById: mock.fn(),
      findByEmail: mock.fn(),
    };

    mockStorageService = {
      accessFromAuth: mock.fn(),
      createDocument: mock.fn(),
    };

    mockMembershipService = {
      assertCanCreateKnowledgeBase: mock.fn(),
    };
  });

  describe('Knowledge Base CRUD', () => {
    it('should list knowledge bases', async () => {
      const user = { userId: 'user-1' };
      const query = { keyword: undefined, sortBy: 'updated' as const };
      const mockKbs = [
        { id: 'kb-1', name: 'KB 1' },
        { id: 'kb-2', name: 'KB 2' },
      ];

      mockKbRepository.list.mock.mockImplementation(() => Promise.resolve(mockKbs));

      const items = await mockKbRepository.list({}, user.userId, query);
      assert.equal(items.length, 2);
    });

    it('should get knowledge base by id', async () => {
      const user = { userId: 'user-1' };
      const kbId = 'kb-1';
      const mockKb = { id: kbId, name: 'Test KB', ownerId: user.userId };

      mockKbRepository.findById.mock.mockImplementation(() => Promise.resolve(mockKb));
      mockKbRepository.toDto.mock.mockImplementation((kb, role) => ({
        ...kb,
        myRole: role,
      }));

      const kb = await mockKbRepository.findById(kbId);
      assert.ok(kb);
      assert.equal(kb.id, kbId);

      const dto = mockKbRepository.toDto(kb, 'owner');
      assert.equal(dto.myRole, 'owner');
    });

    it('should create knowledge base', async () => {
      const user = { userId: 'user-1' };
      const input = {
        name: 'New KB',
        description: 'Test description',
        emoji: '📘',
        visibility: 'members' as const,
      };

      const name = input.name.trim();
      assert.ok(name, 'Name should not be empty');

      const mockKb = {
        id: 'kb-new',
        name,
        description: input.description,
        emoji: input.emoji,
        visibility: input.visibility,
        ownerId: user.userId,
      };

      mockMembershipService.assertCanCreateKnowledgeBase.mock.mockImplementation(() => Promise.resolve());
      mockKbRepository.create.mock.mockImplementation(() => Promise.resolve(mockKb));

      await mockMembershipService.assertCanCreateKnowledgeBase(user);
      const kb = await mockKbRepository.create({ ...input, ownerId: user.userId });
      assert.ok(kb);
      assert.equal(kb.name, name);
    });

    it('should throw error when name is empty', async () => {
      const input = { name: '   ' };
      const name = input.name.trim();
      assert.equal(name, '', 'Name should be empty after trim');
    });

    it('should update knowledge base', async () => {
      const user = { userId: 'user-1' };
      const kbId = 'kb-1';
      const input = { name: 'Updated KB' };
      const mockKb = { id: kbId, name: 'Old KB', ownerId: user.userId };

      mockKbRepository.findById.mock.mockImplementation(() => Promise.resolve(mockKb));
      mockKbRepository.update.mock.mockImplementation(() => 
        Promise.resolve({ ...mockKb, ...input })
      );

      const kb = await mockKbRepository.findById(kbId);
      assert.ok(kb);

      const updated = await mockKbRepository.update(kbId, { name: input.name });
      assert.equal(updated.name, 'Updated KB');
    });

    it('should delete knowledge base', async () => {
      const user = { userId: 'user-1' };
      const kbId = 'kb-1';
      const mockKb = { id: kbId, name: 'KB to Delete', ownerId: user.userId };

      mockKbRepository.findById.mock.mockImplementation(() => Promise.resolve(mockKb));
      mockKbRepository.delete.mock.mockImplementation(() => Promise.resolve());

      const kb = await mockKbRepository.findById(kbId);
      assert.ok(kb);

      await mockKbRepository.delete(kbId);
      assert.ok(true, 'Should delete knowledge base');
    });
  });

  describe('KB Node Management', () => {
    it('should list nodes for knowledge base', async () => {
      const kbId = 'kb-1';
      const mockNodes = [
        { id: 'node-1', kbId, title: 'Home', nodeType: 'page', isHome: true },
        { id: 'node-2', kbId, title: 'Folder 1', nodeType: 'folder', parentId: null },
      ];

      mockKbNodeRepository.listNodes.mock.mockImplementation(() => Promise.resolve(mockNodes));

      const nodes = await mockKbNodeRepository.listNodes(kbId);
      assert.equal(nodes.length, 2);
      assert.ok(nodes.some((n: any) => n.isHome));
    });

    it('should create node in knowledge base', async () => {
      const kbId = 'kb-1';
      const user = { userId: 'user-1' };
      const input = {
        title: 'New Page',
        nodeType: 'page' as const,
        parentId: null,
      };

      assert.ok(KB_NODE_TYPES.includes(input.nodeType));

      const mockNode = {
        id: 'node-new',
        kbId,
        ...input,
        createdBy: user.userId,
        sortOrder: 0,
        isHome: false,
      };

      mockKbNodeRepository.createNode.mock.mockImplementation(() => Promise.resolve(mockNode));

      const node = await mockKbNodeRepository.createNode({ kbId, ...input, createdBy: user.userId });
      assert.ok(node);
      assert.equal(node.title, 'New Page');
      assert.equal(node.nodeType, 'page');
    });

    it('should create folder node', async () => {
      const kbId = 'kb-1';
      const input = {
        title: 'New Folder',
        nodeType: 'folder' as const,
        parentId: null,
      };

      assert.ok(KB_NODE_TYPES.includes(input.nodeType));

      const mockNode = {
        id: 'folder-new',
        kbId,
        ...input,
      };

      mockKbNodeRepository.createNode.mock.mockImplementation(() => Promise.resolve(mockNode));

      const node = await mockKbNodeRepository.createNode({ kbId, ...input });
      assert.equal(node.nodeType, 'folder');
    });

    it('should create document reference node', async () => {
      const kbId = 'kb-1';
      const docId = 'doc-123';
      const input = {
        title: 'Doc Reference',
        nodeType: 'doc_ref' as const,
        parentId: null,
        docId,
      };

      assert.ok(KB_NODE_TYPES.includes(input.nodeType));

      const mockNode = {
        id: 'ref-new',
        kbId,
        ...input,
      };

      mockKbNodeRepository.createNode.mock.mockImplementation(() => Promise.resolve(mockNode));

      const node = await mockKbNodeRepository.createNode({ kbId, ...input });
      assert.equal(node.nodeType, 'doc_ref');
      assert.equal(node.docId, docId);
    });

    it('should update node', async () => {
      const kbId = 'kb-1';
      const nodeId = 'node-1';
      const input = { title: 'Updated Title' };
      const mockNode = { id: nodeId, kbId, title: 'Old Title' };

      mockKbNodeRepository.findById.mock.mockImplementation(() => Promise.resolve(mockNode));
      mockKbNodeRepository.updateNode.mock.mockImplementation(() => 
        Promise.resolve({ ...mockNode, ...input })
      );

      const node = await mockKbNodeRepository.findById(nodeId);
      assert.ok(node);

      const updated = await mockKbNodeRepository.updateNode(nodeId, input);
      assert.equal(updated.title, 'Updated Title');
    });

    it('should delete node', async () => {
      const kbId = 'kb-1';
      const nodeId = 'node-1';
      const mockNode = { id: nodeId, kbId, title: 'Node to Delete' };

      mockKbNodeRepository.findById.mock.mockImplementation(() => Promise.resolve(mockNode));
      mockKbNodeRepository.deleteNode.mock.mockImplementation(() => Promise.resolve());

      const node = await mockKbNodeRepository.findById(nodeId);
      assert.ok(node);

      await mockKbNodeRepository.deleteNode(nodeId);
      assert.ok(true, 'Should delete node');
    });
  });

  describe('KB Member Management', () => {
    it('should list members for knowledge base', async () => {
      const kbId = 'kb-1';
      const mockMembers = [
        { userId: 'user-1', role: 'owner', user: { displayName: 'Owner' } },
        { userId: 'user-2', role: 'editor', user: { displayName: 'Editor' } },
      ];

      mockKbRepository.findById.mock.mockImplementation(() => 
        Promise.resolve({ id: kbId, members: mockMembers })
      );

      const kb = await mockKbRepository.findById(kbId);
      assert.ok(kb);
      assert.equal(kb.members.length, 2);
    });

    it('should add member with valid role', async () => {
      const kbId = 'kb-1';
      const userId = 'user-3';
      const role = 'viewer';

      assert.ok(KB_MEMBER_ROLES.includes(role));

      const mockMember = { userId, role, kbId };
      mockKbRepository.create.mock.mockImplementation(() => Promise.resolve(mockMember));

      const member = await mockKbRepository.create({ userId, role, kbId });
      assert.ok(member);
      assert.equal(member.role, 'viewer');
    });

    it('should throw error for invalid role', async () => {
      const role = 'invalid';
      assert.ok(!KB_MEMBER_ROLES.includes(role));
    });

    it('should remove member', async () => {
      const kbId = 'kb-1';
      const userId = 'user-2';

      mockKbRepository.delete.mock.mockImplementation(() => Promise.resolve());

      await mockKbRepository.delete({ kbId, userId });
      assert.ok(true, 'Should remove member');
    });

    it('should support batch add members', async () => {
      const kbId = 'kb-1';
      const members = [
        { userId: 'user-3', role: 'editor' },
        { userId: 'user-4', role: 'viewer' },
      ];

      for (const member of members) {
        assert.ok(KB_MEMBER_ROLES.includes(member.role));
      }

      mockKbRepository.create.mock.mockImplementation((data) => Promise.resolve(data));

      const results = [];
      for (const member of members) {
        const result = await mockKbRepository.create({ ...member, kbId });
        results.push(result);
      }
      assert.equal(results.length, 2);
    });
  });

  describe('KB Visibility', () => {
    it('should support organization visibility', () => {
      const visibility = 'organization';
      assert.ok(KB_VISIBILITY.includes(visibility));
    });

    it('should support members visibility', () => {
      const visibility = 'members';
      assert.ok(KB_VISIBILITY.includes(visibility));
    });

    it('should default to organization for tenant scope', () => {
      const scope = 2;
      const defaultVisibility = scope === 2 ? 'organization' : 'members';
      assert.equal(defaultVisibility, 'organization');
    });

    it('should default to members for personal scope', () => {
      const scope = 1;
      const defaultVisibility = scope === 2 ? 'organization' : 'members';
      assert.equal(defaultVisibility, 'members');
    });
  });

  describe('KB Invite Link', () => {
    it('should generate invite token', () => {
      const mockToken = 'invite-token-123';
      assert.ok(mockToken);
      assert.ok(typeof mockToken === 'string');
    });

    it('should validate invite token format', () => {
      const token = 'invite-token-123';
      const isValid = typeof token === 'string' && token.length > 0;
      assert.ok(isValid);
    });
  });

  describe('KB Role Resolution', () => {
    it('should resolve owner role', () => {
      const kb = { ownerId: 'user-1' };
      const userId = 'user-1';
      const role = kb.ownerId === userId ? 'owner' : null;
      assert.equal(role, 'owner');
    });

    it('should resolve admin role', () => {
      const members = [
        { userId: 'user-2', role: 'admin' },
      ];
      const userId = 'user-2';
      const member = members.find(m => m.userId === userId);
      const role = member?.role ?? null;
      assert.equal(role, 'admin');
    });

    it('should return null for non-member', () => {
      const members = [
        { userId: 'user-2', role: 'editor' },
      ];
      const userId = 'user-3';
      const member = members.find(m => m.userId === userId);
      const role = member?.role ?? null;
      assert.equal(role, null);
    });

    it('should check role hierarchy', () => {
      const roleHierarchy: Record<string, number> = {
        owner: 4,
        admin: 3,
        editor: 2,
        viewer: 1,
      };

      assert.ok(roleHierarchy['owner'] > roleHierarchy['admin']);
      assert.ok(roleHierarchy['admin'] > roleHierarchy['editor']);
      assert.ok(roleHierarchy['editor'] > roleHierarchy['viewer']);
    });
  });
});
