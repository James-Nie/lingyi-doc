import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { AuthAudience } from '../../../auth/decorators/auth-audience.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../../auth/guards/tenant-context.guard';
import { AIModuleGuard } from '../ai.guard';
import { KnowledgeService } from './knowledge.service';

class EmbedDto {
  documentId!: string;
}

class SearchDto {
  query!: string;
  topK?: number;
  documentIds?: string[];
}

@Controller('api/v1/ai/knowledge')
@UseGuards(JwtAuthGuard, TenantContextGuard, AIModuleGuard)
@AuthAudience('consumer')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('embed')
  embed(@Body() dto: EmbedDto) {
    return this.knowledgeService.embedDocument(dto.documentId);
  }

  @Post('search')
  search(@Body() dto: SearchDto) {
    return this.knowledgeService.search(
      dto.query,
      dto.topK ?? 5,
      undefined,
      dto.documentIds,
    );
  }

  @Delete(':documentId')
  remove(@Param('documentId') documentId: string) {
    return this.knowledgeService.deleteVectors(documentId);
  }
}
