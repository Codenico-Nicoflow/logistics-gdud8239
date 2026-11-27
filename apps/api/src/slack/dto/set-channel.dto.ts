import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SetChannelDto {
  /** Null (or empty) removes the channel: that battalion stops posting that kind to Slack. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  channelId?: string | null;
}
