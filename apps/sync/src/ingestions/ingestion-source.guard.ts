import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { IngestionSourcesService } from './ingestion-sources.service';
import type { IngestionPrincipal } from './ingestion-source.types';
export type IngestionAuthenticatedRequest = Request & {
  ingestionSource: IngestionPrincipal;
};
@Injectable()
export class IngestionSourceGuard implements CanActivate {
  constructor(private readonly sources: IngestionSourcesService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<IngestionAuthenticatedRequest>();
    request.ingestionSource = await this.sources.authenticate(
      request.get('Authorization'),
    );
    return true;
  }
}
