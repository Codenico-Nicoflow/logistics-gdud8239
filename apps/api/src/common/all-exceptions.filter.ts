import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Last line of defence for errors nobody handled. Nest already turns non-HTTP errors into a
 * generic 500, but a Prisma error (a unique-constraint clash, a missing row) then reads as a
 * mystery and is not logged anywhere useful. This maps the ones a user can actually cause to a
 * proper status and message, logs the real error for us, and lets nothing else — no stack, no
 * SQL, no table name — reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // Deliberate errors (validation, auth, throttling, services' own messages) pass through.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.fromPrisma(exception.code);
      if (mapped) {
        response.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message });
        return;
      }
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'אירעה שגיאה. נסו שוב, ואם זה חוזר פנו למנהל.' });
  }

  private fromPrisma(code: string): { status: number; message: string } | null {
    switch (code) {
      case 'P2002':
        return { status: HttpStatus.CONFLICT, message: 'הרשומה כבר קיימת' };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'הרשומה לא נמצאה' };
      case 'P2003':
        return { status: HttpStatus.CONFLICT, message: 'לא ניתן לבצע את הפעולה: הרשומה קשורה לנתונים אחרים' };
      default:
        return null;
    }
  }
}
