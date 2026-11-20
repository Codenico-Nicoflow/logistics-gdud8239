import { IsDateString } from 'class-validator';

export class FinishDayDto {
  @IsDateString({}, { message: 'תאריך לא תקין' })
  sessionDate!: string;
}
