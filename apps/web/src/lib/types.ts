/** Mirrors the API contract. The API speaks enum keys; `he.ts` holds the labels. */

export type Role = 'admin' | 'logistics' | 'viewer';
export type Company = 'A' | 'B' | 'C' | 'SUPPORT' | 'HQ';
export type ItemCategory = 'WEAPON' | 'OPTICS' | 'DRONE' | 'GEAR';
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

export type Item = {
  id: string;
  name: string;
  aliases: string[];
  category: ItemCategory;
  catalogNo: string | null;
  isSerialized: boolean;
  authorizedQty: number;
  unitPrice: string | null;
  isActive: boolean;
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
  catalogNo: string | null;
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
