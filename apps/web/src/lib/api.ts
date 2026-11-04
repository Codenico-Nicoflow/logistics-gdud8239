import { createApi, fetchBaseQuery, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type {
  AllocationRow,
  AuthUser,
  Company,
  ImportPreview,
  Item,
  ItemInstance,
  MatrixRow,
  MovementAction,
  MovementRow,
  NeedsAttention,
  Paginated,
  Signature,
  SoldierSummary,
  Snapshot,
  SummaryRow,
} from './types';

/**
 * Tokens live in httpOnly cookies, so every request must send credentials and
 * no token is ever read by this code.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
});

/**
 * On a 401 the access token has usually just expired; one refresh attempt is
 * made and the original request retried, so a shift is not interrupted every
 * fifteen minutes.
 */
const baseQueryWithRefresh: BaseQueryFn = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const refresh = await rawBaseQuery(
      { url: '/auth/refresh', method: 'POST' },
      api,
      extraOptions,
    );
    if (!refresh.error) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithRefresh,
  tagTypes: ['Auth', 'Signatures', 'Soldiers', 'Items', 'Reports', 'Movements', 'Snapshots', 'Attention'],
  endpoints: (build) => ({
    // --- auth ---
    me: build.query<{ user: AuthUser }, void>({
      query: () => '/auth/me',
      providesTags: ['Auth'],
    }),
    login: build.mutation<{ user: AuthUser }, { username: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Auth'],
    }),
    logout: build.mutation<{ ok: true }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Auth'],
    }),

    // --- soldiers ---
    soldiers: build.query<
      Paginated<SoldierSummary>,
      { q?: string; company?: Company; take?: number; skip?: number; withOpenSignatures?: boolean }
    >({
      query: (params) => ({ url: '/soldiers', params }),
      providesTags: ['Soldiers'],
    }),

    // --- items ---
    items: build.query<Item[], void>({
      query: () => '/items',
      providesTags: ['Items'],
    }),
    availableInstances: build.query<ItemInstance[], string>({
      query: (itemId) => `/items/${itemId}/available`,
      providesTags: ['Items', 'Signatures'],
    }),
    needsAttention: build.query<NeedsAttention, void>({
      query: () => '/items/needs-attention',
      providesTags: ['Attention'],
    }),

    // --- signatures ---
    signatures: build.query<
      Paginated<Signature>,
      {
        q?: string;
        company?: Company;
        itemId?: string;
        soldierId?: string;
        includeReturned?: boolean;
        needsAttentionOnly?: boolean;
        take?: number;
        skip?: number;
      }
    >({
      query: (params) => ({ url: '/signatures', params }),
      providesTags: ['Signatures'],
    }),
    issueItem: build.mutation<
      Signature,
      {
        soldierId: string;
        itemId: string;
        serial?: string;
        quantity?: number;
        receiptNo?: string;
        notes?: string;
      }
    >({
      query: (body) => ({ url: '/signatures/issue', method: 'POST', body }),
      invalidatesTags: ['Signatures', 'Reports', 'Movements', 'Soldiers', 'Items'],
    }),
    returnItem: build.mutation<Signature, { id: string; quantity?: number; notes?: string }>({
      query: ({ id, ...body }) => ({ url: `/signatures/${id}/return`, method: 'POST', body }),
      invalidatesTags: ['Signatures', 'Reports', 'Movements', 'Soldiers', 'Items'],
    }),
    backfillSerial: build.mutation<Signature, { id: string; serial: string }>({
      query: ({ id, serial }) => ({
        url: `/signatures/${id}/backfill-serial`,
        method: 'POST',
        body: { serial },
      }),
      invalidatesTags: ['Signatures', 'Attention', 'Movements', 'Items'],
    }),

    // --- reports ---
    summary: build.query<SummaryRow[], void>({
      query: () => '/reports/summary',
      providesTags: ['Reports'],
    }),
    companyMatrix: build.query<MatrixRow[], void>({
      query: () => '/reports/companies',
      providesTags: ['Reports'],
    }),
    allocations: build.query<AllocationRow[], void>({
      query: () => '/reports/allocations',
      providesTags: ['Reports'],
    }),

    // --- movements ---
    movements: build.query<
      Paginated<MovementRow>,
      {
        q?: string;
        action?: MovementAction;
        company?: Company;
        soldierId?: string;
        itemId?: string;
        from?: string;
        to?: string;
        take?: number;
        skip?: number;
      }
    >({
      query: (params) => ({ url: '/movements', params }),
      providesTags: ['Movements'],
    }),

    // --- snapshots ---
    snapshots: build.query<Snapshot[], void>({
      query: () => '/snapshots',
      providesTags: ['Snapshots'],
    }),
    createSnapshot: build.mutation<{ id: string }, void>({
      query: () => ({ url: '/snapshots', method: 'POST' }),
      invalidatesTags: ['Snapshots'],
    }),
    sendSnapshotToSlack: build.mutation<{ sent: boolean; error?: string }, string>({
      query: (id) => ({ url: `/snapshots/${id}/send-to-slack`, method: 'POST' }),
      invalidatesTags: ['Snapshots'],
    }),

    // --- excel ---
    previewImport: build.mutation<ImportPreview, FormData>({
      query: (body) => ({ url: '/excel/import/preview', method: 'POST', body }),
    }),
    commitImport: build.mutation<ImportPreview & { committed: true }, FormData>({
      query: (body) => ({ url: '/excel/import/commit', method: 'POST', body }),
      invalidatesTags: [
        'Signatures',
        'Soldiers',
        'Items',
        'Reports',
        'Movements',
        'Attention',
        'Snapshots',
      ],
    }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useSoldiersQuery,
  useItemsQuery,
  useAvailableInstancesQuery,
  useNeedsAttentionQuery,
  useSignaturesQuery,
  useIssueItemMutation,
  useReturnItemMutation,
  useBackfillSerialMutation,
  useSummaryQuery,
  useCompanyMatrixQuery,
  useAllocationsQuery,
  useMovementsQuery,
  useSnapshotsQuery,
  useCreateSnapshotMutation,
  useSendSnapshotToSlackMutation,
  usePreviewImportMutation,
  useCommitImportMutation,
} = api;
