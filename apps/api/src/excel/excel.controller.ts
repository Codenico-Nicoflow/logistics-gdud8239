import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExcelExportService } from './excel-export.service';
import { ExcelImportService, type ImportPreview, type ImportResult } from './excel-import.service';
import { SnapshotsService } from '../snapshots/snapshots.service';
import type { AuthUser } from '../auth/auth.types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type UploadedXlsx = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Controller('excel')
export class ExcelController {
  constructor(
    private readonly exporter: ExcelExportService,
    private readonly importer: ExcelImportService,
    private readonly snapshots: SnapshotsService,
  ) {}

  /** Downloads the full workbook, structured like the original file. */
  @Get('export')
  async export(@Res() res: Response): Promise<void> {
    const buffer = await this.exporter.toBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="logistics-${stamp}.xlsx"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }

  /** Validates an upload and reports what an import would do. Writes nothing. */
  @Post('import/preview')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  preview(@UploadedFile() file?: UploadedXlsx): Promise<ImportPreview> {
    return this.importer.preview(this.requireXlsx(file));
  }

  /**
   * Replaces the signature data with the uploaded file.
   *
   * A pre-import snapshot is taken first, so the operation is reversible even
   * though it is a wipe-and-replace.
   */
  @Post('import/commit')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async commit(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file?: UploadedXlsx,
  ): Promise<ImportResult> {
    const buffer = this.requireXlsx(file);
    const snapshot = await this.snapshots.create('pre_import', actor);
    return this.importer.commit(buffer, actor, snapshot.id);
  }

  private requireXlsx(file?: UploadedXlsx): Buffer {
    if (!file) throw new BadRequestException('לא נבחר קובץ');
    if (file.mimetype !== XLSX_MIME && !file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('נדרש קובץ אקסל מסוג xlsx');
    }
    if (file.size === 0) throw new BadRequestException('הקובץ ריק');
    return file.buffer;
  }
}
