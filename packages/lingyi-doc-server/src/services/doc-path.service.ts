import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../database/entities/document.entity';
import { KnowledgeBaseEntity } from '../database/entities/knowledge-base.entity';
import { TenantEntity } from '../database/entities/tenant.entity';
import { UserEntity } from '../database/entities/user.entity';
import {
  generateBookSlug,
  generateDocSlug,
  generateSpaceSlug,
} from '../utils/docSlug';
import type { DocPublicPathSegments } from '../utils/docPublicPath';
import {
  buildCollaboratorJoinPath,
  buildDocOwnerPath,
  buildPublicLinkJoinPath,
} from '../utils/docPublicPath';

export interface DocPathContext extends DocPublicPathSegments {
  docId: string;
  title: string;
}

@Injectable()
export class DocPathService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docRepo: Repository<DocumentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(KnowledgeBaseEntity)
    private readonly kbRepo: Repository<KnowledgeBaseEntity>,
  ) {}

  buildOwnerPath(segments: DocPublicPathSegments): string {
    return buildDocOwnerPath(segments);
  }

  buildCollaboratorJoinUrl(segments: DocPublicPathSegments, token: string, title?: string | null): string {
    return buildCollaboratorJoinPath(segments, token, title);
  }

  buildPublicLinkJoinUrl(segments: DocPublicPathSegments, token: string, title?: string | null): string {
    return buildPublicLinkJoinPath(segments, token, title);
  }

  async ensureUserSpaceSlugs(userId: string, displayName: string): Promise<{ spaceSlug: string; bookSlug: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('用户不存在');

    let spaceSlug = user.personalSpaceSlug;
    let bookSlug = user.defaultBookSlug;
    let changed = false;

    if (!spaceSlug) {
      spaceSlug = await this.generateUniqueSpaceSlug(displayName, 'user');
      user.personalSpaceSlug = spaceSlug;
      changed = true;
    }
    if (!bookSlug) {
      bookSlug = generateBookSlug();
      user.defaultBookSlug = bookSlug;
      changed = true;
    }
    if (changed) {
      await this.userRepo.save(user);
    }
    return { spaceSlug, bookSlug };
  }

  async ensureTenantSpaceSlugs(tenantId: string, tenantName: string): Promise<{ spaceSlug: string; bookSlug: string }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error('租户不存在');

    let spaceSlug = tenant.spaceSlug;
    let bookSlug = tenant.defaultBookSlug;
    let changed = false;

    if (!spaceSlug) {
      spaceSlug = await this.generateUniqueSpaceSlug(tenantName, 'tenant');
      tenant.spaceSlug = spaceSlug;
      changed = true;
    }
    if (!bookSlug) {
      bookSlug = generateBookSlug();
      tenant.defaultBookSlug = bookSlug;
      changed = true;
    }
    if (changed) {
      await this.tenantRepo.save(tenant);
    }
    return { spaceSlug, bookSlug };
  }

  async ensureDocSlug(docId: string): Promise<string> {
    const doc = await this.docRepo.findOne({ where: { id: docId } });
    if (!doc) throw new Error('文档不存在');
    if (doc.docSlug) return doc.docSlug;

    let docSlug = generateDocSlug();
    while (await this.docRepo.findOne({ where: { docSlug } })) {
      docSlug = generateDocSlug();
    }
    await this.docRepo.update(docId, { docSlug });
    return docSlug;
  }

  async ensureKbSlug(kbId: string): Promise<string> {
    const kb = await this.kbRepo.findOne({ where: { id: kbId } });
    if (!kb) throw new Error('知识库不存在');
    if (kb.kbSlug) return kb.kbSlug;

    let kbSlug = generateBookSlug();
    while (await this.kbRepo.findOne({ where: { kbSlug } })) {
      kbSlug = generateBookSlug();
    }
    await this.kbRepo.update(kbId, { kbSlug });
    return kbSlug;
  }

  async resolvePathByDocId(docId: string): Promise<DocPathContext | null> {
    const rows = await this.docRepo.query(
      `SELECT
        d.id AS docId,
        d.title AS title,
        d.doc_slug AS docSlug,
        d.scope AS scope,
        d.owner_id AS ownerId,
        d.tenant_id AS tenantId,
        u.personal_space_slug AS personalSpaceSlug,
        u.default_book_slug AS userBookSlug,
        u.display_name AS ownerDisplayName,
        t.space_slug AS tenantSpaceSlug,
        t.default_book_slug AS tenantBookSlug,
        t.name AS tenantName,
        kb.kb_slug AS kbSlug
      FROM documents d
      LEFT JOIN users u ON d.owner_id = u.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      LEFT JOIN kb_nodes kn ON kn.doc_id = d.id AND kn.is_deleted = 0
      LEFT JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = 0
      WHERE d.id = ? AND d.is_deleted = 0
      LIMIT 1`,
      [docId],
    ) as Array<{
      docId: string;
      title: string;
      docSlug: string | null;
      scope: number;
      ownerId: string | null;
      tenantId: string | null;
      personalSpaceSlug: string | null;
      userBookSlug: string | null;
      ownerDisplayName: string | null;
      tenantSpaceSlug: string | null;
      tenantBookSlug: string | null;
      tenantName: string | null;
      kbSlug: string | null;
    }>;

    const row = rows[0];
    if (!row) return null;

    const docSlug = row.docSlug ?? await this.ensureDocSlug(docId);

    let spaceSlug: string;
    let bookSlug: string;

    if (row.scope === 2 && row.tenantId) {
      const tenantSlugs = await this.ensureTenantSpaceSlugs(
        row.tenantId,
        row.tenantName ?? 'tenant',
      );
      spaceSlug = tenantSlugs.spaceSlug;
      bookSlug = row.kbSlug ?? tenantSlugs.bookSlug;
    } else if (row.ownerId) {
      const userSlugs = await this.ensureUserSpaceSlugs(
        row.ownerId,
        row.ownerDisplayName ?? 'user',
      );
      spaceSlug = userSlugs.spaceSlug;
      bookSlug = row.kbSlug ?? userSlugs.bookSlug;
    } else {
      return null;
    }

    if (row.kbSlug == null) {
      const kbRow = await this.docRepo.query(
        `SELECT kb.id FROM kb_nodes kn
         INNER JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = 0
         WHERE kn.doc_id = ? AND kn.is_deleted = 0 LIMIT 1`,
        [docId],
      ) as Array<{ id: string }>;
      if (kbRow[0]?.id) {
        bookSlug = await this.ensureKbSlug(kbRow[0].id);
      }
    }

    return {
      docId,
      title: row.title,
      spaceSlug,
      bookSlug,
      docSlug,
    };
  }

  async resolveDocIdByPath(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
  ): Promise<DocPathContext | null> {
    const rows = await this.docRepo.query(
      `SELECT
        d.id AS docId,
        d.title AS title,
        d.doc_slug AS docSlug,
        COALESCE(t.space_slug, u.personal_space_slug) AS spaceSlug,
        COALESCE(kb.kb_slug, t.default_book_slug, u.default_book_slug) AS bookSlug
      FROM documents d
      LEFT JOIN users u ON d.owner_id = u.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      LEFT JOIN kb_nodes kn ON kn.doc_id = d.id AND kn.is_deleted = 0
      LEFT JOIN knowledge_bases kb ON kb.id = kn.kb_id AND kb.is_deleted = 0
      WHERE d.doc_slug = ?
        AND d.is_deleted = 0
        AND (
          (d.scope = 2 AND t.space_slug = ? AND (kb.kb_slug = ? OR (kb.kb_slug IS NULL AND t.default_book_slug = ?)))
          OR (d.scope = 1 AND u.personal_space_slug = ? AND (kb.kb_slug = ? OR (kb.kb_slug IS NULL AND u.default_book_slug = ?)))
        )
      LIMIT 1`,
      [docSlug, spaceSlug, bookSlug, bookSlug, spaceSlug, bookSlug, bookSlug],
    ) as Array<{
      docId: string;
      title: string;
      docSlug: string;
      spaceSlug: string;
      bookSlug: string;
    }>;

    const row = rows[0];
    if (!row) return null;
    return {
      docId: row.docId,
      title: row.title,
      spaceSlug: row.spaceSlug,
      bookSlug: row.bookSlug,
      docSlug: row.docSlug,
    };
  }

  private async generateUniqueSpaceSlug(name: string, kind: 'user' | 'tenant'): Promise<string> {
    const fallbackPrefix = kind === 'user' ? 'user' : 'org';
    for (let i = 0; i < 8; i += 1) {
      const candidate = generateSpaceSlug(name, fallbackPrefix);
      if (kind === 'user') {
        const exists = await this.userRepo.findOne({ where: { personalSpaceSlug: candidate } });
        if (!exists) return candidate;
      } else {
        const exists = await this.tenantRepo.findOne({ where: { spaceSlug: candidate } });
        if (!exists) return candidate;
      }
    }
    return generateSpaceSlug(String(Date.now()), fallbackPrefix);
  }
}
