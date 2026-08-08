import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { DocumentShareService } from '../modules/document-share/document-share.service';
import type { DocumentSharePathPort } from '../ports/document-share-path.port';

@Injectable()
export class DocumentSharePathAdapter implements DocumentSharePathPort {
  constructor(private readonly documentShareService: DocumentShareService) {}

  resolvePathForUser(auth: AuthUser, docId: string): Promise<unknown> {
    return this.documentShareService.resolvePathForUser(auth, docId);
  }
}
