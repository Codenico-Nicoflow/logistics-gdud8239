import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllocationsService } from './allocations.service';
import { CreateServicePeriodDto, UpdateServicePeriodDto } from './dto/service-period.dto';
import { AddGridItemDto, SetCompanyAllocationDto } from './dto/company-allocation.dto';
import { SetOnHandOverrideDto } from './dto/on-hand-override.dto';
import { SetSoldierAllocationDto } from './dto/soldier-allocation.dto';
import type { AuthUser } from '../auth/auth.types';
import type { CompanyCode } from '../companies/company-code';

@Controller()
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  @Get('service-periods')
  findAllPeriods() {
    return this.allocations.findAllPeriods();
  }

  @Get('service-periods/active')
  findActivePeriod() {
    return this.allocations.findActivePeriod();
  }

  @Post('service-periods')
  @Roles('admin')
  createPeriod(@Body() dto: CreateServicePeriodDto) {
    return this.allocations.createPeriod(dto);
  }

  @Patch('service-periods/:id')
  @Roles('admin')
  updatePeriod(@Param('id') id: string, @Body() dto: UpdateServicePeriodDto) {
    return this.allocations.updatePeriod(id, dto);
  }

  // `logistics` always reads this, matrix or not: ניפוק needs it to warn when
  // a weapon would exceed what was allocated to the soldier's company, which
  // has to work regardless of whatever the admin has set in הרשאות.
  @Get('service-periods/:id/company-allocations')
  @RequirePermission('allocations.battalion', 'READ', ['logistics', 'SHLISHUT'])
  findCompanyAllocations(@Param('id') id: string) {
    return this.allocations.findCompanyAllocations(id);
  }

  @Post('service-periods/:id/company-allocations')
  @RequirePermission('allocations.battalion', 'WRITE')
  setCompanyAllocation(@Param('id') id: string, @Body() dto: SetCompanyAllocationDto) {
    return this.allocations.setCompanyAllocation(id, dto);
  }

  @Post('service-periods/:id/company-allocations/items')
  @RequirePermission('allocations.battalion', 'WRITE')
  addGridItem(@Param('id') id: string, @Body() dto: AddGridItemDto) {
    return this.allocations.addItemToGrid(id, dto.itemId);
  }

  @Delete('service-periods/:id/company-allocations/items/:itemId')
  @RequirePermission('allocations.battalion', 'WRITE')
  removeGridItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.allocations.removeItemFromGrid(id, itemId);
  }

  /** Admin only — the samgad plans against whatever this says, never above
   *  the item's real בפועל, but deliberately kept off everyone else's screen. */
  @Post('service-periods/:id/on-hand-override')
  @Roles('admin')
  setOnHandOverride(@Param('id') id: string, @Body() dto: SetOnHandOverrideDto) {
    return this.allocations.setOnHandOverride(id, dto);
  }

  // ---------- soldier allocations (סגן מפקד פלוגה) ----------

  /** `company` lets admin inspect any company; a סגן מפקד פלוגה is always
   *  locked to their own regardless of what's passed — enforced in the service. */
  @Get('service-periods/:id/soldier-allocations')
  @RequirePermission('allocations.company', 'READ', ['COMPANY_CMDR'])
  findSoldierAllocations(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Query('company') company?: CompanyCode,
  ) {
    return this.allocations.findSoldierAllocations(id, actor, company);
  }

  @Get('service-periods/:id/soldier-allocations/soldiers')
  @RequirePermission('allocations.company', 'READ', ['COMPANY_CMDR'])
  findCompanySoldiers(@CurrentUser() actor: AuthUser, @Query('company') company?: CompanyCode) {
    return this.allocations.findCompanySoldiers(actor, company);
  }

  @Post('service-periods/:id/soldier-allocations')
  @RequirePermission('allocations.company', 'WRITE', ['COMPANY_CMDR'])
  setSoldierAllocation(
    @Param('id') id: string,
    @Body() dto: SetSoldierAllocationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.allocations.setSoldierAllocation(id, dto, actor);
  }

  // ---------- ניפוק bundle expansion ----------

  // Same guard as company-allocations: ניפוק has to work for logistics/
  // SHLISHUT regardless of whatever the admin has set in הרשאות.
  @Get('soldiers/:soldierId/entitlement')
  @RequirePermission('allocations.battalion', 'READ', ['logistics', 'SHLISHUT'])
  findSoldierEntitlement(@Param('soldierId') soldierId: string) {
    return this.allocations.findSoldierEntitlement(soldierId);
  }

  @Get('issue-bundle')
  @RequirePermission('allocations.battalion', 'READ', ['logistics', 'SHLISHUT'])
  findIssueBundle(@Query('itemName') itemName: string) {
    return this.allocations.findIssueBundle(itemName);
  }
}
