import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/permission.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  /** Every signed-in role needs the names to draw its own screens, so reading is not restricted. */
  @Get()
  list() {
    return this.companies.list();
  }

  /** Writing is admin-only: `companies` is not in the editable matrix, so only the always-passing admin gets through. */
  @Post()
  @RequirePermission('companies', 'WRITE')
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Patch(':id')
  @RequirePermission('companies', 'WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }
}
