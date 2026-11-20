import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { IntakeService } from './intake.service';
import { SubmitIntakeDto } from './dto/submit-intake.dto';

@Controller('intake')
@Roles('admin')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post()
  submit(@Body() dto: SubmitIntakeDto) {
    return this.intake.submit(dto);
  }
}
