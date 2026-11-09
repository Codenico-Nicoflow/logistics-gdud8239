import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttendanceService } from './attendance.service';
import {
  BulkAttendanceDto,
  CreateTeamMemberDto,
  UpdateTeamMemberDto,
} from './dto/attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('week')
  week(@Query('date') date: string) {
    return this.attendance.week(date ?? new Date().toISOString().slice(0, 10));
  }

  @Get('today')
  today(@Query('date') date?: string) {
    return this.attendance.today(date);
  }

  @Get('members')
  members(@Query('includeInactive') includeInactive?: string) {
    return this.attendance.listMembers(includeInactive === 'true');
  }

  @Post('cells')
  @Roles('admin', 'logistics')
  setCells(@Body() dto: BulkAttendanceDto) {
    return this.attendance.setCells(dto);
  }

  @Post('members')
  @Roles('admin', 'logistics')
  createMember(@Body() dto: CreateTeamMemberDto) {
    return this.attendance.createMember(dto);
  }

  @Patch('members/:id')
  @Roles('admin', 'logistics')
  updateMember(@Param('id') id: string, @Body() dto: UpdateTeamMemberDto) {
    return this.attendance.updateMember(id, dto);
  }
}
