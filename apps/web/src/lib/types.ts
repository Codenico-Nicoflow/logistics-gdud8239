/** Mirrors the API contract. The API speaks enum keys; `he.ts` holds the labels. */

export type Role = 'admin' | 'logistics' | 'viewer';
export type Company = 'A' | 'B' | 'C' | 'SUPPORT' | 'HQ';
export type ItemCategory = 'WEAPON' | 'OPTICS' | 'DRONE' | 'ACCESSORY' | 'GEAR';
export type InstanceStatus = 'OK' | 'FAULTY' | 'DISABLED';
/** דוח תנועות holds weapon movements only: an item given out, or taken back. */
export type MovementAction = 'ISSUE' | 'RETURN';
export type SnapshotKind = 'daily' | 'pre_import' | 'manual';
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
  platoon: string | null;
  isActive: boolean;
  openSignatureCount: number;
};

/** A soldier with what they currently hold, for the confirmation step. */
export type SoldierDetail = {
  id: string;
  firstName: string;
  lastName: string;
  personalNumber: string | null;
  phone: string | null;
  company: Company;
  platoon: string | null;
  isActive: boolean;
  signatures: {
    id: string;
    quantity: number;
    item: { id: string; name: string };
    itemInstance: { id: string; serial: string } | null;
  }[];
};

/** The fields accepted when creating a soldier; only these four are required. */
export type NewSoldier = {
  firstName: string;
  lastName: string;
  company: Company;
  personalNumber?: string;
  phone?: string;
  platoon?: string;
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
  needsAttention: boolean;
  soldier: SoldierSummary;
  item: Item;
  itemInstance: ItemInstance | null;
};

export type SummaryRow = {
  itemName: string;
  itemId: string;
  issued: number;
  /** Counted on the shelf; `null` until someone has counted. */
  inArmory: number | null;
  faulty: number;
  serviceable: number | null;
  total: number | null;
  authorized: number;
  /** מצבה − (מנופק + נספר); `null` with no count to compare against. */
  gap: number | null;
  countedAt: string | null;
};

export type CountShift = 'EVENING' | 'MORNING';

export type CountSheetRow = {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  authorizedQty: number;
  issued: number;
  countedQty: number | null;
  faultyQty: number;
  gap: number | null;
  notes: string | null;
};

export type CountSheet = {
  session: { id: string; isClosed: boolean } | null;
  rows: CountSheetRow[];
  signers: Record<string, string | null>;
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
};

export type TodayMember = {
  teamMemberId: string;
  nickname: string;
  gender: Gender;
  status: AttendanceStatus | null;
  note: string | null;
};

export type Today = {
  date: string;
  byStatus: { status: AttendanceStatus; members: TodayMember[] }[];
  /** Nobody has filled this person's cell yet — not the same as absent. */
  unmarked: TodayMember[];
  present: number;
  total: number;
};

export type LatestCount = {
  session: {
    id: string;
    sessionDate: string;
    shift: CountShift;
    isClosed: boolean;
    recordedBy: string | null;
  } | null;
  countedItems: number;
  totalItems: number;
  mismatches: { itemName: string; gap: number }[];
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
};

export type MatrixRow = {
  itemName: string;
  byCompany: Record<Company, number>;
  total: number;
  inArmory: number;
};

export type AllocationRow = {
  itemName: string;
  targets: Record<Company, number>;
  issued: Record<Company, number>;
  remaining: Record<Company, number>;
  totalTarget: number;
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

export type ImportIssue = {
  id: string;
  kind: IssueKind;
  rowNumber: number;
  rawRow: string;
  detail: string;
  signatureId: string | null;
  serial: string | null;
  resolvedAt: string | null;
};

export type NeedsAttention = {
  issues: ImportIssue[];
  signatures: Signature[];
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

export type ImportPreview = {
  totalRows: number;
  soldiers: number;
  signatures: number;
  instances: number;
  mergedIntoQuantity: number;
  issues: { kind: IssueKind; count: number; examples: string[] }[];
  perItem: { itemName: string; count: number }[];
  perCompany: { company: string; count: number }[];
};

// --- טופס 1008: kits and signed handover forms ---

/**
 * A kit is a named standard handover — `ערכת M-4` is the rifle plus the
 * magazines, sling and cleaning kit that always go out with it. Picking one
 * fills the basket; every line stays editable, so the kit is a starting point
 * rather than a rule.
 */
export type Kit = {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  lines: KitLine[];
};

export type KitLine = {
  id: string;
  kitId: string;
  itemId: string;
  quantity: number;
  sortOrder: number;
  item: {
    id: string;
    name: string;
    category: ItemCategory;
    isSerialized: boolean;
    unitOfMeasure: string;
  };
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
