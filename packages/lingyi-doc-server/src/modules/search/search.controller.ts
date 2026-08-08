import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchRequestDto, SearchResponseDto } from './search.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import type { DocumentAccessContext } from '../../types/session';

function buildDocumentAccessContext(user: AuthUser): DocumentAccessContext {
  return {
    userId: user.userId,
    identityType: user.currentIdentityType ?? 'personal',
    tenantId: user.currentTenantId ?? null,
  };
}

@Controller('api/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query() request: SearchRequestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SearchResponseDto> {
    const ctx = buildDocumentAccessContext(user);
    const { results, hasMore } = await this.searchService.search(request, ctx);
    return { results, hasMore };
  }
}