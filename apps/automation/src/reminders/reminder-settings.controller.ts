import {
  Body,
  Controller,
  Get,
  Header,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../session-client/session.guard';
import { WriteSessionGuard } from '../session-client/write-session.guard';
import { UpdateReminderSettingsDto } from './dto/update-reminder-settings.dto';
import { ReminderSettingsService } from './reminder-settings.service';
import type { ReminderSettingsView } from './reminder.types';

@Controller('api/v1/automation/reminders/settings')
export class ReminderSettingsController {
  constructor(private readonly settings: ReminderSettingsService) {}

  @Get()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ settings: ReminderSettingsView | null }> {
    return {
      settings: await this.settings.get(request.tenantId),
    };
  }

  @Put()
  @UseGuards(WriteSessionGuard)
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateReminderSettingsDto,
  ): Promise<ReminderSettingsView> {
    return this.settings.update(request.tenantId, input);
  }
}
