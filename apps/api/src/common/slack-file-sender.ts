import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { SlackConfigService } from '../slack/slack-config.service';
import type { SlackKind } from '../slack/slack-kinds';

/**
 * Uploads a file (or a plain message) to a Slack channel. A seam of its own so a
 * feature that sends can be tested without Slack, and so "Slack is not configured"
 * is decided in one place.
 */
@Injectable()
export class SlackFileSender {
  constructor(
    private readonly config: ConfigService,
    private readonly channels: SlackConfigService,
  ) {}

  /** This battalion's channel for `kind`, or undefined when it has none or the deployment has no bot. */
  channelFor(kind: SlackKind): Promise<string | undefined> {
    return this.channels.channel(kind);
  }

  async sendFile(channel: string, file: Buffer, filename: string, comment: string): Promise<void> {
    await this.client().filesUploadV2({ channel_id: channel, file, filename, initial_comment: comment });
  }

  async sendMessage(channel: string, text: string): Promise<void> {
    await this.client().chat.postMessage({ channel, text });
  }

  private client(): WebClient {
    return new WebClient(this.config.get<string>('SLACK_BOT_TOKEN'));
  }
}
