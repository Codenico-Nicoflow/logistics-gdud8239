import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignaturesService } from '../signatures/signatures.service';
import { findOperationalServicePeriod } from '../common/active-service-period';
import type { AuthUser } from '../auth/auth.types';
import type { CreateIssueFormDto } from './dto/create-issue-form.dto';

const UNIQUE_VIOLATION = 'P2002';

/**
 * `טופס 1008` — issuing a soldier everything at once, against one signature.
 *
 * The paper form this replaces covers a whole handover: a weapon with its מסד
 * and the magazines, sling and cleaning kit that go with it. Issuing those as
 * separate actions would leave no single thing the soldier signed, which is
 * the point of the form.
 *
 * Every line is written in one transaction with the form itself. A מסד that
 * turns out to be held by someone else fails the whole handover rather than
 * leaving half of it recorded — the soldier signed for a list, so the list is
 * what lands or does not.
 */
@Injectable()
export class IssueFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatures: SignaturesService,
  ) {}

  async create(dto: CreateIssueFormDto, actor: AuthUser) {
    const soldier = await this.prisma.soldier.findUnique({ where: { id: dto.soldierId } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    if (!soldier.isActive) throw new BadRequestException('החייל אינו פעיל');
    if (actor.companyScope && soldier.company !== actor.companyScope) {
      throw new BadRequestException('אין לך הרשאה לחתום על חיילים מפלוגה זו');
    }

    const items = await this.prisma.item.findMany({
      where: { id: { in: dto.lines.map((l) => l.itemId) } },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Validated up front, before anything is written: the operator gets one
    // clear reason rather than a partially-applied handover.
    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);
      if (!item) throw new NotFoundException('אחד הפריטים אינו קיים');
      if (!item.isActive) throw new BadRequestException(`הפריט "${item.name}" אינו פעיל`);

      const serial = line.serial?.trim();
      if (item.isSerialized && !serial) {
        throw new BadRequestException(`הפריט "${item.name}" הוא פריט מסד — חובה להזין מסד`);
      }
      if (serial && line.quantity !== 1) {
        throw new BadRequestException(`פריט עם מסד מנופק ביחידה אחת (${item.name})`);
      }
    }

    // A weapon can only go to a soldier שלישות has marked מחויל for a
    // תעסוקה that is both ACTIVE and actually running today — same gate as
    // the older direct-sign path in SignaturesService, ported here since
    // the 1008 basket is now the real ניפוק flow and must enforce it too.
    if (dto.lines.some((l) => itemById.get(l.itemId)?.category === 'WEAPON')) {
      const activePeriod = await findOperationalServicePeriod(this.prisma);
      if (!activePeriod) {
        throw new BadRequestException('אין תעסוקה מבצעית פעילה כעת — לא ניתן לנפק נשק');
      }
      const enlistment = await this.prisma.soldierEnlistment.findUnique({
        where: { soldierId_servicePeriodId: { soldierId: soldier.id, servicePeriodId: activePeriod.id } },
      });
      if (!enlistment) {
        throw new BadRequestException(
          `${soldier.firstName} ${soldier.lastName} אינו מחויל לתקופת השרות הנוכחית — לא ניתן לנפק נשק`,
        );
      }
    }

    // A מסד can appear once on a form: the same physical weapon cannot be
    // handed over twice in one handover.
    const serials = dto.lines
      .map((l) => (l.serial ? `${l.itemId}|${l.serial.trim()}` : null))
      .filter((s): s is string => s !== null);
    if (new Set(serials).size !== serials.length) {
      throw new BadRequestException('אותו מסד מופיע יותר מפעם אחת בטופס');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await tx.issueForm.create({
          data: {
            soldierId: soldier.id,
            soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
            personalNumberSnapshot: soldier.personalNumber,
            companySnapshot: soldier.company,
            phoneSnapshot: soldier.phone,
            signatureImage: dto.signatureImage,
            issuedByUserId: actor.id,
            issuedByNameSnapshot: actor.displayName,
            receiptNo: dto.receiptNo?.trim() || null,
            notes: dto.notes ?? null,
          },
        });

        for (const line of dto.lines) {
          const item = itemById.get(line.itemId);
          if (!item) continue;
          const serial = line.serial?.trim();

          let itemInstanceId: string | null = null;
          if (serial) {
            // The register is still being built from the signatures as they
            // are entered, so an unknown מסד is recorded rather than refused.
            const instance = await tx.itemInstance.upsert({
              where: { itemId_serial: { itemId: item.id, serial } },
              update: {},
              create: { itemId: item.id, serial },
            });
            if (instance.status !== 'OK') {
              throw new BadRequestException(
                `מסד "${serial}" מסומן כ"${instance.status}" ולא ניתן לניפוק`,
              );
            }
            const held = await tx.signature.findFirst({
              where: { itemInstanceId: instance.id, returnedAt: null },
              include: { soldier: true },
            });
            // Held by someone else is a real conflict; held by this same
            // soldier is just him re-signing for a מסד he already has —
            // e.g. a reissue that only touched an unrelated line, carrying
            // this one forward unchanged. His own open signature on it is
            // reused below instead of treated as a collision.
            if (held && held.soldierId !== soldier.id) {
              throw new ConflictException(
                `מסד "${serial}" חתום כבר על ${held.soldier.firstName} ${held.soldier.lastName}`,
              );
            }
            itemInstanceId = instance.id;
          }

          // A bulk item the soldier already holds increments rather than
          // opening a second row, matching how ניפוק behaves elsewhere. A
          // serialized item he already holds (same מסד, caught above) reuses
          // that exact signature rather than incrementing — its quantity is
          // always 1, so "increment" would make no sense for it.
          const existing = await tx.signature.findFirst({
            where: itemInstanceId
              ? { itemInstanceId, returnedAt: null }
              : { soldierId: soldier.id, itemId: item.id, itemInstanceId: null, returnedAt: null },
          });

          const signature = existing
            ? itemInstanceId
              ? // A serialized מסד he already holds: nothing to add, it's
                // always exactly 1 — reuse the signature as-is.
                existing
              : await tx.signature.update({
                  where: { id: existing.id },
                  data: { quantity: { increment: line.quantity } },
                })
            : await tx.signature.create({
                data: {
                  soldierId: soldier.id,
                  itemId: item.id,
                  itemInstanceId,
                  quantity: line.quantity,
                  receiptNo: dto.receiptNo?.trim() || null,
                  signedByUserId: actor.id,
                },
              });

          await tx.issueFormLine.create({
            data: {
              issueFormId: form.id,
              itemId: item.id,
              itemNameSnapshot: item.name,
              serialSnapshot: serial ?? null,
              // Snapshotted with the line: the printed form must keep saying
              // י"ח as it read when signed, even if the catalog changes later.
              unitOfMeasure: item.unitOfMeasure,
              quantity: line.quantity,
              lineNotes: line.lineNotes?.trim() || null,
              signatureId: signature.id,
            },
          });

          await tx.movement.create({
            data: {
              action: 'ISSUE',
              soldierId: soldier.id,
              soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
              companySnapshot: soldier.company,
              itemId: item.id,
              itemNameSnapshot: item.name,
              serialSnapshot: serial ?? null,
              quantity: line.quantity,
              performedByUserId: actor.id,
              performedByNameSnapshot: actor.displayName,
              receiptNo: dto.receiptNo?.trim() || null,
              signatureId: signature.id,
            },
          });
        }

        return tx.issueForm.findUniqueOrThrow({
          where: { id: form.id },
          include: { lines: { orderBy: { itemNameSnapshot: 'asc' } } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION) {
        throw new ConflictException('אחד המסדים נחתם על חייל אחר בו זמנית. נסה שוב.');
      }
      throw e;
    }
  }

  /**
   * A real change to what a soldier is holding — a different מסד, a
   * different item, more or fewer units — is never an edit of a signed
   * form. `issue_forms`/`issue_form_lines` are what he actually signed, and
   * that stays exactly as it was. Instead this returns whatever the new
   * lines no longer cover (or reduces its quantity), then signs a brand new
   * 1008 for the new state — the soldier's second signature is what makes
   * the change real, same as it would be on paper.
   *
   * Deliberately its own implementation, not a thin wrapper around
   * `create()`: `dto.lines` here is the soldier's whole *target* state, not
   * a delta to add on top of what he already holds — `create()`'s bulk-item
   * branch increments an existing signature's quantity (right for the
   * normal ניפוק flow, where a new line really is "give him more"), which
   * would double-count a carried-forward or reduced quantity here. Every
   * line below sets its signature to the new quantity directly instead.
   */
  async reissue(originalFormId: string, dto: CreateIssueFormDto, actor: AuthUser) {
    const original = await this.prisma.issueForm.findUniqueOrThrow({
      where: { id: originalFormId },
    });
    const soldier = await this.prisma.soldier.findUnique({ where: { id: dto.soldierId } });
    if (!soldier) throw new NotFoundException('החייל אינו קיים');
    if (original.soldierId !== soldier.id) {
      throw new BadRequestException('לא ניתן להחליף טופס בין חיילים שונים');
    }
    if (!soldier.isActive) throw new BadRequestException('החייל אינו פעיל');
    if (actor.companyScope && soldier.company !== actor.companyScope) {
      throw new BadRequestException('אין לך הרשאה לחתום על חיילים מפלוגה זו');
    }

    const items = await this.prisma.item.findMany({
      where: { id: { in: dto.lines.map((l) => l.itemId) } },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);
      if (!item) throw new NotFoundException('אחד הפריטים אינו קיים');
      if (!item.isActive) throw new BadRequestException(`הפריט "${item.name}" אינו פעיל`);
      const serial = line.serial?.trim();
      if (item.isSerialized && !serial) {
        throw new BadRequestException(`הפריט "${item.name}" הוא פריט מסד — חובה להזין מסד`);
      }
      if (serial && line.quantity !== 1) {
        throw new BadRequestException(`פריט עם מסד מנופק ביחידה אחת (${item.name})`);
      }
    }

    if (dto.lines.some((l) => itemById.get(l.itemId)?.category === 'WEAPON')) {
      const activePeriod = await findOperationalServicePeriod(this.prisma);
      if (!activePeriod) {
        throw new BadRequestException('אין תעסוקה מבצעית פעילה כעת — לא ניתן לנפק נשק');
      }
      const enlistment = await this.prisma.soldierEnlistment.findUnique({
        where: { soldierId_servicePeriodId: { soldierId: soldier.id, servicePeriodId: activePeriod.id } },
      });
      if (!enlistment) {
        throw new BadRequestException(
          `${soldier.firstName} ${soldier.lastName} אינו מחויל לתקופת השרות הנוכחית — לא ניתן לנפק נשק`,
        );
      }
    }

    const serials = dto.lines
      .map((l) => (l.serial ? `${l.itemId}|${l.serial.trim()}` : null))
      .filter((s): s is string => s !== null);
    if (new Set(serials).size !== serials.length) {
      throw new BadRequestException('אותו מסד מופיע יותר מפעם אחת בטופס');
    }

    const supersedeNote = `מחליף טופס 1008 מספר ${original.formNo} (${new Date().toLocaleDateString('he-IL')})`;
    const notes = dto.notes ? `${supersedeNote} — ${dto.notes}` : supersedeNote;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await tx.issueForm.create({
          data: {
            soldierId: soldier.id,
            soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
            personalNumberSnapshot: soldier.personalNumber,
            companySnapshot: soldier.company,
            phoneSnapshot: soldier.phone,
            signatureImage: dto.signatureImage,
            issuedByUserId: actor.id,
            issuedByNameSnapshot: actor.displayName,
            receiptNo: dto.receiptNo?.trim() || null,
            notes,
          },
        });

        const touchedSignatureIds = new Set<string>();

        for (const line of dto.lines) {
          const item = itemById.get(line.itemId);
          if (!item) continue;
          const serial = line.serial?.trim();

          let itemInstanceId: string | null = null;
          if (serial) {
            const instance = await tx.itemInstance.upsert({
              where: { itemId_serial: { itemId: item.id, serial } },
              update: {},
              create: { itemId: item.id, serial },
            });
            if (instance.status !== 'OK') {
              throw new BadRequestException(
                `מסד "${serial}" מסומן כ"${instance.status}" ולא ניתן לניפוק`,
              );
            }
            const held = await tx.signature.findFirst({
              where: { itemInstanceId: instance.id, returnedAt: null },
              include: { soldier: true },
            });
            // Held by this same soldier is the normal carried-forward case —
            // his own open signature on it is reused below. Held by anyone
            // else is a real conflict.
            if (held && held.soldierId !== soldier.id) {
              throw new ConflictException(
                `מסד "${serial}" חתום כבר על ${held.soldier.firstName} ${held.soldier.lastName}`,
              );
            }
            itemInstanceId = instance.id;
          }

          // His own existing open signature for this exact item (+ מסד, when
          // it has one) is the one being carried forward or changed — set to
          // the new target quantity directly, never incremented, since
          // `dto.lines` already describes the end state, not a delta.
          const existing = await tx.signature.findFirst({
            where: itemInstanceId
              ? { itemInstanceId, returnedAt: null }
              : { soldierId: soldier.id, itemId: item.id, itemInstanceId: null, returnedAt: null },
          });

          // Whether this line actually changed anything — a brand-new item,
          // or an existing one at a different quantity than it already had.
          // A line simply carried forward untouched (same item, same
          // quantity, same מסד) must not read in דוח תנועות as a fresh
          // ניפוק of something that never moved.
          const changed = !existing || existing.quantity !== line.quantity;

          const signature = existing
            ? changed
              ? await tx.signature.update({
                  where: { id: existing.id },
                  data: { quantity: line.quantity },
                })
              : existing
            : await tx.signature.create({
                data: {
                  soldierId: soldier.id,
                  itemId: item.id,
                  itemInstanceId,
                  quantity: line.quantity,
                  receiptNo: dto.receiptNo?.trim() || null,
                  signedByUserId: actor.id,
                },
              });
          touchedSignatureIds.add(signature.id);

          await tx.issueFormLine.create({
            data: {
              issueFormId: form.id,
              itemId: item.id,
              itemNameSnapshot: item.name,
              serialSnapshot: serial ?? null,
              unitOfMeasure: item.unitOfMeasure,
              quantity: line.quantity,
              lineNotes: line.lineNotes?.trim() || null,
              signatureId: signature.id,
            },
          });

          if (changed) {
            await tx.movement.create({
              data: {
                action: 'ISSUE',
                soldierId: soldier.id,
                soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
                companySnapshot: soldier.company,
                itemId: item.id,
                itemNameSnapshot: item.name,
                serialSnapshot: serial ?? null,
                quantity: line.quantity,
                performedByUserId: actor.id,
                performedByNameSnapshot: actor.displayName,
                receiptNo: dto.receiptNo?.trim() || null,
                // Tags every line this reissue touched, so דוח תנועות can
                // show "this wasn't a fresh ניפוק, it's an edit of an
                // existing handover" at a glance, not just infer it from a
                // matching RETURN row nearby.
                notes: `עריכת טופס — ${supersedeNote}`,
                signatureId: signature.id,
              },
            });
          }
        }

        // Anything he still has open from before that the new lines dropped
        // entirely (an item removed outright, not just reduced) is returned
        // now — a reduced-but-kept quantity was already set directly above,
        // so only a fully-dropped line needs an explicit return here.
        const stillOpenFromBefore = await tx.signature.findMany({
          where: { soldierId: soldier.id, returnedAt: null, id: { notIn: [...touchedSignatureIds] } },
          include: { itemInstance: true },
        });
        const originalLines = await tx.issueFormLine.findMany({ where: { issueFormId: original.id } });
        const originalSignatureIds = new Set(
          originalLines.map((l) => l.signatureId).filter((id): id is string => id !== null),
        );
        for (const sig of stillOpenFromBefore) {
          if (!originalSignatureIds.has(sig.id)) continue;
          await tx.signature.update({
            where: { id: sig.id },
            data: { returnedAt: new Date(), returnedByUserId: actor.id },
          });
          await tx.movement.create({
            data: {
              action: 'RETURN',
              soldierId: soldier.id,
              soldierNameSnapshot: `${soldier.firstName} ${soldier.lastName}`,
              companySnapshot: soldier.company,
              itemId: sig.itemId,
              itemNameSnapshot: itemById.get(sig.itemId)?.name ?? '',
              // The old מסד, when this was serialized — without it, a מסד
              // swap (e.g. replacing the weapon itself) reads in דוח תנועות
              // as a RETURN with no serial next to an ISSUE that has one,
              // instead of clearly showing which מסד came back.
              serialSnapshot: sig.itemInstance?.serial ?? null,
              quantity: sig.quantity,
              performedByUserId: actor.id,
              performedByNameSnapshot: actor.displayName,
              notes: `עריכת טופס — ${supersedeNote}`,
              signatureId: sig.id,
            },
          });
        }

        return tx.issueForm.findUniqueOrThrow({
          where: { id: form.id },
          include: { lines: { orderBy: { itemNameSnapshot: 'asc' } } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION) {
        throw new ConflictException('אחד המסדים נחתם על חייל אחר בו זמנית. נסה שוב.');
      }
      throw e;
    }
  }

  /** Forms for the list view, newest first. The signature image is omitted. */
  async findAll(query: { soldierId?: string; take?: number; skip?: number }) {
    const where = query.soldierId ? { soldierId: query.soldierId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.issueForm.findMany({
        where,
        orderBy: { signedAt: 'desc' },
        take: query.take ?? 50,
        skip: query.skip ?? 0,
        select: {
          id: true,
          formNo: true,
          soldierNameSnapshot: true,
          personalNumberSnapshot: true,
          companySnapshot: true,
          signedAt: true,
          issuedByNameSnapshot: true,
          lines: { select: { itemNameSnapshot: true, serialSnapshot: true, quantity: true } },
        },
      }),
      this.prisma.issueForm.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * The form as it reads today: מס קבלה/הערות come from the latest
   * amendment if one exists, else the original signed values — everything
   * else (lines, soldier, issuer, both signatures, the date) is always the
   * original row, since `issue_forms` itself is append-only and that is
   * exactly what was actually signed.
   */
  async findOne(id: string) {
    const form = await this.prisma.issueForm.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { itemNameSnapshot: 'asc' } },
        amendments: { orderBy: { amendedAt: 'desc' }, take: 1 },
      },
    });
    const { amendments, ...rest } = form;
    const latest = amendments[0];
    return {
      ...rest,
      receiptNo: latest ? latest.receiptNo : rest.receiptNo,
      notes: latest ? latest.notes : rest.notes,
    };
  }

  /**
   * A signed form's header details only — מס קבלה and the free-text note.
   * Never the soldier/issuer identity, the lines, the signature image, or
   * the date: those are what was actually signed, and changing any of them
   * after the fact would mean the printed form no longer matches what the
   * soldier put his signature to. `issue_forms` is append-only at the DB
   * level (trigger), so this is never an UPDATE on that row — it writes a
   * new `IssueFormAmendment` instead, same audit-safe shape, and `findOne`
   * resolves the latest one as the effective value.
   */
  async update(
    id: string,
    dto: { receiptNo?: string; notes?: string },
    actor: AuthUser,
  ) {
    await this.prisma.issueForm.findUniqueOrThrow({ where: { id } });
    await this.prisma.issueFormAmendment.create({
      data: {
        issueFormId: id,
        receiptNo: dto.receiptNo || null,
        notes: dto.notes || null,
        amendedByUserId: actor.id,
      },
    });
    return this.findOne(id);
  }
}
