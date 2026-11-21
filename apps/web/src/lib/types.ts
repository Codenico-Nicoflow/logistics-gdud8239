/** Mirrors the API contract. The API speaks enum keys; `he.ts` holds the labels. */

export type Role = 'admin' | 'logistics' | 'viewer' | 'SHLISHUT' | 'SAMGAD' | 'COMPANY_CMDR';
export type Company = 'A' | 'B' | 'C' | 'SUPPORT' | 'HQ';
export type ItemCategory = 'WEAPON' | 'OPTICS' | 'DRONE' | 'ACCESSORY' | 'GEAR' | 'AMMO';
export type InstanceStatus = 'OK' | 'FAULTY' | 'DISABLED' | 'IN_REPAIR';
/** דוח תנועות holds weapon movements only: an item given out, or taken back. */
export type MovementAction = 'ISSUE' | 'RETURN';
export type SnapshotKind = 'daily' | 'pre_import' | 'manual';
export type DbBackupKind = 'daily' | 'manual';
export type IssueKind =
  | 'MISSING_SERIAL'
  | 'DUPLICATE_SERIAL'
  | 'UNKNOWN_ITEM'
  | 'UNKNOWN_COMPANY'
  | 'MISSING_SOLDIER_NAME'
  | 'DUPLICATE_ROW';

export const COMPANIES: Company[] = ['A', 'B', 'C', 'SUPPORT', 'HQ'];

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  companyScope: Company | null;
};

export type Paginated<T> = { rows: T[]; total: number };

export type SoldierSummary = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  company: Company;
  isActive: boolean;
  openSignatureCount: number;
  /** מחויל לתקופת השרות הפעילה. `null` when there is no active service period. */
  isEnlisted: boolean | null;
};

/** A soldier with what they currently hold, for the confirmation step. */
export type SoldierDetail = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  company: Company;
  isActive: boolean;
  signatures: {
    id: string;
    quantity: number;
    item: { id: string; name: string };
    itemInstance: { id: string; serial: string } | null;
  }[];
  /** מחויל לתקופת השרות הפעילה. `null` when there is no active service period at all. */
  isEnlisted: boolean | null;
};

/** The fields accepted when creating a soldier; only these four are required. */
export type NewSoldier = {
  firstName: string;
  lastName: string;
  company: Company;
  personalNumber?: string;
  phone?: string;
};

export type Item = {
  id: string;
  name: string;
  aliases: string[];
  category: ItemCategory;
  /** Whether a מסד is mandatory when signing this item out. */
  isSerialized: boolean;
  /** Whether the item appears in מסכם and in ספירת נשקיה. */
  inSummary: boolean;
  authorizedQty: number;
  /** Units physically at ימ״ח, out of authorizedQty. בפועל is derived as the difference. */
  yamahQty: number;
  /** Bulk units currently sent out for repair, out of authorizedQty — same
   *  idea as yamahQty. Serialized items track this per מסד instead, via
   *  InstanceStatus.IN_REPAIR. */
  repairQty: number;
  unitPrice: string | null;
  isActive: boolean;
  /** The quantity a 1008 starts at for this item — 5 for מחסנית, 1 for most. */
  defaultQty: number;
  /** How the printed form counts it: יח', זוג, ק"ג. */
  unitOfMeasure: string;
};

export type ItemInstance = {
  id: string;
  itemId: string;
  serial: string;
  status: InstanceStatus;
  notes: string | null;
};

/** `GET /items/:id/available`'s own shape — flags the soldier's last-held
 *  serial for this item, if `soldierId` was passed and it's still free. */
export type AvailableInstance = ItemInstance & { isPreviouslyHeld: boolean };

/** One מסד as the catalog drill-down shows it: who holds it, if anyone. */
export type ItemInstanceWithHolder = ItemInstance & {
  signatures: { id: string; soldier: SoldierSummary }[];
};

/** `GET /items/:id` — the catalog row plus every מסד registered under it. */
export type ItemDetail = Item & {
  instances: ItemInstanceWithHolder[];
};

export type Signature = {
  id: string;
  soldierId: string;
  itemId: string;
  itemInstanceId: string | null;
  quantity: number;
  receiptNo: string | null;
  notes: string | null;
  signedAt: string;
  returnedAt: string | null;
  soldier: SoldierSummary;
  item: Item;
  itemInstance: ItemInstance | null;
};

/** One line of what a soldier currently holds, as `holders` nests it — same
 *  shape as `Signature` minus the (redundant, since this is already inside
 *  his own row) `soldier` field. */
export type HolderSignature = Omit<Signature, 'soldier' | 'soldierId'>;

/** `GET /signatures/holders` — one row per soldier who holds anything right
 *  now, his open items nested, plus every 1008 he's ever signed (for
 *  opening/printing the actual signed form, not just the line-item list). */
export type SignatureHolder = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  company: Company;
  itemCount: number;
  signatures: HolderSignature[];
  forms: { id: string; formNo: number; signedAt: string }[];
};

export type SummaryRow = {
  itemName: string;
  itemId: string;
  issued: number;
  /** בנשקייה, entered once a day in מסכם; `null` until filled in for the date. */
  inArmory: number | null;
  total: number | null;
  authorized: number;
  /** מצבה − (מנופק + בנשקייה); `null` with nothing to compare against. */
  gap: number | null;
};

export type MesakemRow = {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  issued: number;
  authorizedQty: number;
  nashkiyaQty: number | null;
  gap: number | null;
};

export type MesakemSheet = {
  rows: MesakemRow[];
  sentAt: string | null;
};

export type CountShift = 'EVENING' | 'MORNING';

export type CountSheetRow = {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  nashkiyaQty: number | null;
};

export type CountSheet = {
  session: { id: string; isClosed: boolean } | null;
  rows: CountSheetRow[];
  signers: {
    responsibleName: string | null;
    responsiblePn: string | null;
    responsibleRank: string | null;
    responsibleSignatureImage: string | null;
    officerName: string | null;
    officerPn: string | null;
    officerRank: string | null;
    officerSignatureImage: string | null;
  };
};

export type AttendanceStatus =
  | 'PRESENT'
  | 'LEAVING'
  | 'RETURNING'
  | 'ON_LEAVE'
  | 'GIMELIM'
  | 'CLOSED_ORDER'
  | 'OTHER';

export type Gender = 'M' | 'F';

export type TeamMember = {
  id: string;
  nickname: string;
  fullName: string | null;
  personalNumber: string | null;
  gender: Gender;
  isActive: boolean;
  sortOrder: number;
};

export type WeekRow = {
  teamMemberId: string;
  nickname: string;
  gender: Gender;
  cells: { status: AttendanceStatus | null; note: string | null }[];
};

export type Week = {
  dates: string[];
  rows: WeekRow[];
  presentPerDay: number[];
  /** Of each day's present count, how many are specifically חזרה. */
  returningPerDay: number[];
};

export type RecentCountSession = {
  id: string;
  sessionDate: string;
  shift: CountShift;
  isClosed: boolean;
  responsibleName: string | null;
  officerName: string | null;
  recordedBy: { displayName: string } | null;
};

export type DeletionCheck = {
  canDelete: boolean;
  issuedCount: number;
  instanceCount: number;
  historyCount: number;
  reasons: string[];
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  companyScope: Company | null;
  isActive: boolean;
  createdAt: string;
  isSuperAdmin: boolean;
};

export type MatrixRow = {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  inSummary: boolean;
  byCompany: Record<Company, number>;
  total: number;
  inArmory: number;
};

export type MovementRow = {
  id: string;
  action: MovementAction;
  occurredAt: string;
  soldierName: string;
  company: Company | null;
  itemName: string;
  serial: string | null;
  quantity: number;
  receiptNo: string | null;
  performedBy: string;
  notes: string | null;
  /** A bulk ACCESSORY item with no מסד (מחסניות, מק פורק, רצועה…) — never a
   *  serialized item, regardless of category. Drives the "הצג הכל / דוח
   *  צלם" toggle in the daily report. */
  routine: boolean;
};

export type Snapshot = {
  id: string;
  createdAt: string;
  kind: SnapshotKind;
  sizeBytes: number;
  rowCount: number;
  slackSentAt: string | null;
  slackError: string | null;
  createdBy: { displayName: string } | null;
};

/** A raw pg_dump of the whole database — disaster-recovery copy, separate
 *  from Snapshot (the re-importable xlsx business export). */
export type DbBackup = {
  id: string;
  createdAt: string;
  kind: DbBackupKind;
  sizeBytes: number;
  slackSentAt: string | null;
  slackError: string | null;
  createdBy: { displayName: string } | null;
};

// --- תקופת שרות: battalion/company allocations, and signed handover forms ---

export type ServicePeriodStatus = 'PLANNING' | 'ACTIVE' | 'CLOSED';

export type ServicePeriod = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: ServicePeriodStatus;
};

/**
 * One row of the samgad's grid — an item split across the five companies,
 * capped against בפועל (onHand), not מצבה.
 */
export type CompanyAllocationRow = {
  itemId: string;
  item: { id: string; name: string; category: ItemCategory; unitOfMeasure: string };
  /** What the samgad plans against — the admin's override if one is set, else realOnHand. */
  onHand: number;
  /** authorizedQty − yamahQty, always the catalog's true figure, regardless of any override. */
  realOnHand: number;
  /** The admin's period-only cap on this item, or `null` if none is set. Never above realOnHand. */
  onHandOverride: number | null;
  quantities: Record<Company, number>;
  /** What that company has actually been handed — open signatures, not the plan. */
  issued: Record<Company, number>;
  /** quantities[c] − issued[c] — how much of its own planned share the company has left to hand out. */
  remaining: Record<Company, number>;
  total: number;
};

export type NewServicePeriod = { name: string; startsAt: string; endsAt: string };

/** A basic soldier reference, for the סגן מפקד פלוגה's own-company roster. */
export type CompanySoldierRef = { id: string; firstName: string; lastName: string };

/** One auto-added accessory line from `/issue-bundle`, for a weapon just added to a 1008 basket. */
export type IssueBundleLine = { item: Item; quantity: number };

/** One item row of a company commander's per-soldier planning breakdown. */
export type SoldierAllocationRow = {
  itemId: string;
  item: { id: string; name: string; category: ItemCategory; unitOfMeasure: string; isSerialized: boolean };
  /** The company's own planned quantity for this item, from CompanyAllocation — the ceiling here. */
  companyQuantity: number;
  bySoldier: Record<string, number>;
  total: number;
};

/** One line as it was handed over. Snapshots, so the form stays true later. */
export type IssueFormLine = {
  id: string;
  itemId: string;
  itemNameSnapshot: string;
  serialSnapshot: string | null;
  quantity: number;
  unitOfMeasure: string;
  lineNotes: string | null;
};

export type IssueForm = {
  id: string;
  formNo: number;
  soldierId: string;
  soldierNameSnapshot: string;
  personalNumberSnapshot: string | null;
  companySnapshot: Company;
  phoneSnapshot: string | null;
  receiptNo: string | null;
  signedAt: string;
  issuedByNameSnapshot: string;
  notes: string | null;
  lines: IssueFormLine[];
};

/** The list view omits the signature image and the soldier's phone. */
export type IssueFormSummary = {
  id: string;
  formNo: number;
  soldierNameSnapshot: string;
  personalNumberSnapshot: string | null;
  companySnapshot: Company;
  signedAt: string;
  issuedByNameSnapshot: string;
  lines: { itemNameSnapshot: string; serialSnapshot: string | null; quantity: number }[];
};

/** What the 1008 screen sends: the whole basket against one signature. */
export type NewIssueForm = {
  soldierId: string;
  lines: { itemId: string; serial?: string; quantity: number; lineNotes?: string }[];
  signatureImage: string;
  receiptNo?: string;
  notes?: string;
};

// --- קליטת ציוד ---

/** One row of the intake review grid, already resolved to a real catalog item. */
export type IntakeRow = {
  itemId: string;
  kind: 'serial' | 'bulk';
  serial?: string;
  quantity?: number;
  /** e.g. "שייך לחטיבה" when the item didn't come from ימ״ח — kept on the מסד itself. */
  notes?: string;
};

export type NewIntake = {
  rows: IntakeRow[];
};

export type IntakeResult = {
  serialsCreated: number;
  serialsSkipped: number;
  bulkItemsUpdated: number;
};
