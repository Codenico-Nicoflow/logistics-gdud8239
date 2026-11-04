/** Mirrors the API contract. The API speaks enum keys; `he.ts` holds the labels. */

export type Role = 'admin' | 'logistics' | 'viewer';
export type Company = 'A' | 'B' | 'C' | 'SUPPORT' | 'HQ';
export type ItemCategory = 'WEAPON' | 'OPTICS' | 'DRONE' | 'GEAR';
export type InstanceStatus = 'OK' | 'FAULTY' | 'DISABLED';
export type MovementAction = 'ISSUE' | 'RETURN' | 'IMPORT';
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
  catalogNo: string | null;
  issued: number;
  inArmory: number;
  faulty: number;
  serviceable: number;
  total: number;
  authorized: number;
  gap: number;
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
