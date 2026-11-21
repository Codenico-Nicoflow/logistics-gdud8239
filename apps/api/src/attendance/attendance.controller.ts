import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { israelToday } from '../common/israel-date';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AttendanceService } from './attendance.service';
import {
  BulkAttendanceDto,
  CreateTeamMemberDto,
  UpdateTeamMemberDto,
} from './dto/attendance.dto';

/** Sunday of the week containing `iso`, as a week count relative to this
 *  week's own Sunday — 0 is this week, -1 last week, 1 next. Mirrors the
 *  frontend's own clamp so a direct API call can't reach further than the
 *  UI already lets a חייל לוגיסטיקה click to. */
function weeksFromToday(iso: string): number {
  const toSunday = (d: Date) => {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay());
    return copy.getTime();
  };
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((toSunday(new Date(iso)) - toSunday(new Date(israelToday()))) / msPerWeek);
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('week')
  week(@Query('date') date: string, @CurrentUser() user: AuthUser) {
    const iso = date ?? israelToday();
    if (user.role === 'logistics' && Math.abs(weeksFromToday(iso)) > 1) {
      throw new BadRequestException('לוגיסטיקה יכולה לצפות רק בשבוע הקודם, הנוכחי והבא');
    }
    return this.attendance.week(iso);
  }

  @Get('members')
  members(@Query('includeInactive') includeInactive?: string) {
    return this.attendance.listMembers(includeInactive === 'true');
  }

  // חייל לוגיסטיקה sees the same grid (the GET routes above stay open to
  // both), but only admin edits — the UI already hides the controls, this
  // is the enforcement a direct API call can't bypass.
  @Post('cells')
  @Roles('admin')
  setCells(@Body() dto: BulkAttendanceDto) {
    return this.attendance.setCells(dto);
  }

  @Post('members')
  @Roles('admin')
  createMember(@Body() dto: CreateTeamMemberDto) {
    return this.attendance.createMember(dto);
  }

  @Patch('members/:id')
  @Roles('admin')
  updateMember(@Param('id') id: string, @Body() dto: UpdateTeamMemberDto) {
    return this.attendance.updateMember(id, dto);
  }
}
