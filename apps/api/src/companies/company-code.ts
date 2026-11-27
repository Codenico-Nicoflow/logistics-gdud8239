/**
 * A company's stable key ("A", "SUPPORT", or a generated one for a battalion's own). Every table that
 * refers to a company stores this and the API speaks it; the human name lives in `companies.name` and can
 * change. It is a plain string, not a union, because a battalion defines its own companies.
 */
export type CompanyCode = string;
