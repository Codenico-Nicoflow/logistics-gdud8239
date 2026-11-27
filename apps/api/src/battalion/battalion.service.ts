import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_LOGO_BYTES, sniffLogo, type LogoMime } from './logo-image';

export type BattalionInfo = { id: string; name: string; number: string; hasLogo: boolean; logoVersion: number };

/** What every printed page and spreadsheet names itself after. */
export type Unit = { name: string; number: string };

/** The signed-in battalion only: row-level security leaves no other row visible to this connection. */
@Injectable()
export class BattalionService {
  constructor(private readonly prisma: PrismaService) {}

  async info(): Promise<BattalionInfo> {
    const b = await this.prisma.battalion.findFirstOrThrow({
      select: { id: true, name: true, number: true, logoMime: true, logoVersion: true },
    });
    return { id: b.id, name: b.name, number: b.number, hasLogo: b.logoMime !== null, logoVersion: b.logoVersion };
  }

  async unit(): Promise<Unit> {
    return this.prisma.battalion.findFirstOrThrow({ select: { name: true, number: true } });
  }

  async logo(): Promise<{ data: Uint8Array; mime: LogoMime }> {
    const b = await this.prisma.battalion.findFirstOrThrow({ select: { logoData: true, logoMime: true } });
    if (!b.logoData || (b.logoMime !== 'image/png' && b.logoMime !== 'image/jpeg')) throw new NotFoundException();
    return { data: b.logoData, mime: b.logoMime };
  }

  async setLogo(body: unknown): Promise<BattalionInfo> {
    if (!(body instanceof Uint8Array) || body.length === 0) {
      throw new BadRequestException('יש לצרף קובץ תמונה בפורמט PNG או JPEG');
    }
    if (body.length > MAX_LOGO_BYTES) throw new BadRequestException('התמונה גדולה מדי (עד 512KB)');
    const mime = sniffLogo(body);
    if (!mime) throw new BadRequestException('הלוגו חייב להיות PNG או JPEG');
    const current = await this.prisma.battalion.findFirstOrThrow({ select: { id: true } });
    await this.prisma.battalion.update({
      where: { id: current.id },
      data: { logoData: new Uint8Array(body), logoMime: mime, logoVersion: { increment: 1 } },
    });
    return this.info();
  }

  async clearLogo(): Promise<BattalionInfo> {
    const current = await this.prisma.battalion.findFirstOrThrow({ select: { id: true } });
    await this.prisma.battalion.update({
      where: { id: current.id },
      data: { logoData: null, logoMime: null, logoVersion: { increment: 1 } },
    });
    return this.info();
  }
}
