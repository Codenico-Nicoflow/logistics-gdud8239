/** Mirrors the API contract. The API speaks enum keys; `he.ts` holds the labels (except company names, which are data). */

export type Role = 'admin' | 'logistics' | 'viewer' | 'SHLISHUT' | 'SAMGAD' | 'COMPANY_CMDR';
/** A company's stable code ("A", "SUPPORT", or a generated one). Its name is data: see `CompanyInfo` and `useCompanies()`. */
export type Company = string;

/** The signed-in battalion, as `GET /battalion` returns it. `logoVersion` changes with the picture so a cached copy is never stale. */
export type BattalionInfo = { id: string; name: string; number: string; hasLogo: boolean; logoVersion: number };

/** The optional parts of the product a super admin can switch; mirrors the server's manifest. */
export const MODULE_IDS = ['companySplit', 'attendance', 'kits'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
export type ModuleState = Record<ModuleId, boolean>;
export type ModulesInfo = { enabled: ModuleState; canChange: boolean };

export const SLACK_KINDS = ['snapshots', 'mesakem', 'attendance'] as const;
export type SlackKind = (typeof SLACK_KINDS)[number];
/** What Slack can do for this battalion. `channels` (the ids themselves) is only sent to the platform admin. */
export type SlackOverview = {
  botReady: boolean;
  configured: Record<SlackKind, boolean>;
  channels: Record<SlackKind, string | null> | null;
};

/** One of the battalion's companies, as `GET /companies` returns it. */
export type CompanyInfo = { id: string; code: Company; name: string; sortOrder: number; isActive: boolean };
export type ItemCategory = 'WEAPON' | 'OPTICS' | 'DRONE' | 'ACCESSORY' | 'GEAR' | 'AMMO';
export type InstanceStatus = 'OK' | 'FAULTY' | 'DISABLED' | 'IN_REPAIR';
/** דוח תנועות holds weapon movements only: an item given out, or taken back. */
export type MovementAction = 'ISSUE' | 'RETURN' | 'STORE' | 'COLLECT';
export type IfsunStatus = 'STORED' | 'COLLECTED' | 'CREDITED';
export type SnapshotKind = 'daily' | 'pre_import' | 'manual';
export type DbBackupKind = 'daily' | 'manual';
/** What a new item of each category starts with for אפסון; the admin can change it per item. */
export const IFSUN_DEFAULT_CATEGORIES: ItemCategory[] = ['WEAPON', 'OPTICS', 'DRONE'];

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  companyScope: Company | null;
  /** The battalion this session serves; everything the API returns is that battalion's. */
  battalionId: string;
  /** Where the person really belongs. Differs from `battalionId` only while acting inside another battalion. */
  homeBattalionId: string;
  /** The real person's id while acting inside another battalion; null otherwise. */
  actorId: string | null;
  /** The platform operator: the only one who may use full-database backups and the permission matrix. */
  isPlatformAdmin: boolean;
};

export type Paginated<T> = { rows: T[]; total: number };

export type SoldierSummary = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  /** The number on the note beside his personal weapon on the shelf; unique within his company. */
  receiptNo: string | null;
  company: Company;
  isActive: boolean;
  /** מסופח — attached from another unit rather than organic to the battalion. */
  isAttached: boolean;
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
  receiptNo: string | null;
  company: Company;
  isActive: boolean;
  isAttached: boolean;
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
  /** An empty string clears it. */
  receiptNo?: string;
  isAttached?: boolean;
};

/** What a company has used so far, so the next note can be numbered without counting the shelf. */
export type ReceiptHint = { last: string | null; next: string };

export type Item = {
  id: string;
  name: string;
  aliases: string[];
  category: ItemCategory;
  /** Whether a מסד is mandatory when signing this item out. */
  isSerialized: boolean;
  /** Whether the item appears in מסכם and in ספירת נשקיה. */
  inSummary: boolean;
  /** Whether units may be stored on the shelf (אפסון). */
  ifsunAllowed: boolean;
  authorizedQty: number;
  /** Units physically at ימ״ח, out of authorizedQty. בפועל is derived as the difference. */
  yamahQty: number;
  /** Bulk units currently sent out for repair, out of authorizedQty — same
   *  idea as yamahQty. Serialized items track this per מסד instead, via
   *  InstanceStatus.IN_REPAIR. */
  repairQty: number;
  /** Which units are in repair: for a serialized item the מסדים marked בתיקון (derived), for a bulk item the ones typed beside the count. */
  repairSerials: string[];
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
  /** Open אפסון records — non-empty means the item is signed to him but sits in the armory. */
  ifsunRecords?: { id: string; quantity: number; storedAt: string }[];
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
  /** Units on the shelf under אפסון — counted in בנשקייה, not in מנופק. */
  stored?: number;
  authorizedQty: number;
  nashkiyaQty: number | null;
  gap: number | null;
};

export type MesakemSheet = {
  rows: MesakemRow[];
  sentAt: string | null;
  /** Closed counts that signed this day's figures — changing them reopens these. */
  signedCounts: { id: string; shift: CountShift; date: string }[];
};

export type CountShift = 'EVENING' | 'MORNING';

export type CountSheetRow = {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  nashkiyaQty: number | null;
};

export type CountSheet = {
  /** The מסכם day the figures come from — the day before for a morning count. */
  figureDate: string;
  session: {
    id: string;
    isClosed: boolean;
    lastReopen: { at: string; by: string; reason: string } | null;
    /** מסכם changed after this open count was last saved — the numbers on screen may be stale. */
    figuresChangedAfterStart: boolean;
  } | null;
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

export type ItemKitSummary = {
  baseItem: { id: string; name: string; category: ItemCategory };
  lineCount: number;
  updatedAt: string;
};

export type ItemKitLine = { item: Item; quantity: number };

export type ItemKitDetail = { baseItem: Item; lines: ItemKitLine[]; updatedAt: string | null };

export type KitSnapshotLine = { itemName: string; quantity: number };

export type ItemKitChange = {
  id: string;
  at: string;
  baseItemName: string;
  actorName: string;
  before: KitSnapshotLine[];
  after: KitSnapshotLine[];
};

export type DeletionCheck = {
  canDelete: boolean;
  issuedCount: number;
  instanceCount: number;
  historyCount: number;
  inKits: string[];
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
  /** Set while the account is locked after too many wrong passwords. */
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  /** A setup link is outstanding: the account cannot log in until its owner opens it. */
  mustSetup?: boolean;
  /** Whether the person has set up the authenticator app. */
  mfaEnabled?: boolean;
  /** A super-admin excused them from the authenticator step. */
  mfaExempt?: boolean;
};

/** The one-time link an admin hands to a person; the server returns it exactly once. */
export type SetupLink = { url: string; expiresAt: string };

/** One row of the platform operator's list of battalions. */
export type PlatformBattalion = {
  id: string;
  name: string;
  number: string;
  createdAt: string;
  userCount: number;
  /** Active admins who have chosen a password. Zero means nobody can run the battalion yet. */
  adminCount: number;
  hasLogo: boolean;
};
export type CreatedBattalion = { battalion: PlatformBattalion; admin: { id: string; username: string }; setup: SetupLink };
export type NewBattalionInput = { name: string; number: string; adminUsername: string; adminDisplayName: string };

export type SecurityEventRow = {
  id: string;
  at: string;
  type: string;
  ip: string | null;
  detail: string | null;
  actorUserId: string | null;
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

/** `GET /ifsun` — one stay of an item in the armory under a soldier's name. */
export type IfsunRecord = {
  id: string;
  signatureId: string;
  soldierId: string;
  soldierNameSnapshot: string;
  companySnapshot: Company | null;
  itemId: string;
  itemNameSnapshot: string;
  serialSnapshot: string | null;
  quantity: number;
  status: IfsunStatus;
  notes: string | null;
  storedAt: string;
  storedByName: string;
  closedAt: string | null;
  closedByName: string | null;
  closeNotes: string | null;
  storeSignerName: string | null;
  collectSignerName: string | null;
  /** Only on `GET /ifsun/:id` — the list leaves the (large) images out. */
  storeSignatureImage?: string | null;
  collectSignatureImage?: string | null;
};

/** What a sign-in answers: a finished sign-in, or the next step still owed. */
export type LoginResult = { user: AuthUser } | { step: 'totp' | 'enroll'; mfaToken: string };

/** What the authenticator app screen needs to know about the signed-in person. */
export type MfaStatus = {
  enabled: boolean;
  backupCodesLeft: number;
  /** Required of everyone right now. */
  enforced: boolean;
  exempt: boolean;
  /** False while it is required of this person: they may not switch it off. */
  canDisable: boolean;
};

/** The secret to scan (as a link for the QR code) or type in by hand. */
export type MfaEnrolStart = { secret: string; otpauthUrl: string };

export type MfaOverview = { enforced: boolean; enrolled: number; active: number; exempt: number };
