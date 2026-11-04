import { Controller, Get, Query } from '@nestjs/common';
import { MovementsService, type MovementRow } from './movements.service';
import { QueryMovementsDto } from './dto/query-movements.dto';
import type { Paginated } from '../common/pagination.dto';

/** `דוח תנועות` — read-only for every authenticated role. */
@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  findAll(@Query() query: QueryMovementsDto): Promise<Paginated<MovementRow>> {
    return this.movements.findAll(query);
  }
}
