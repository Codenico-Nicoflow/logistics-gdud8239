import { createApi, fetchBaseQuery, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type {
  AllocationRow,
  AuthUser,
  Company,
  CountSheet,
  CountShift,
  DeletionCheck,
  ItemCategory,
  PublicUser,
  TeamMember,
  Week,
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
  Today,
  LatestCount,
  NewSoldier,
  SoldierDetail,
  Kit,
  IssueForm,
  IssueFormSummary,
  NewIssueForm,
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
  tagTypes: [
    'Auth',
    'Signatures',
    'Soldiers',
    'Items',
    'Reports',
    'Movements',
    'Snapshots',
    'Attention',
    'Counts',
    'Attendance',
    'Users',
    'Kits',
    'IssueForms',
  ],
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
      {
        q?: string;
        company?: Company;
        take?: number;
        skip?: number;
        withOpenSignatures?: boolean;
        holding?: 'with' | 'without';
        incompleteOnly?: boolean;
      }
    >({
      query: (params) => ({ url: '/soldiers', params }),
      providesTags: ['Soldiers'],
    }),

    soldier: build.query<SoldierDetail, string>({
      query: (id) => `/soldiers/${id}`,
      providesTags: ['Soldiers', 'Signatures'],
    }),
    updateSoldier: build.mutation<SoldierSummary, { id: string } & Partial<NewSoldier>>({
      query: ({ id, ...body }) => ({ url: `/soldiers/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Soldiers'],
    }),
    createSoldier: build.mutation<SoldierSummary, NewSoldier>({
      query: (body) => ({ url: '/soldiers', method: 'POST', body }),
      invalidatesTags: ['Soldiers'],
    }),
    /** Asked before creating, so a likely duplicate is shown rather than made. */
    checkDuplicateSoldier: build.mutation<SoldierSummary[], NewSoldier>({
      query: (body) => ({ url: '/soldiers/check-duplicates', method: 'POST', body }),
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

    // --- counts (ספירת נשקיה) ---
    countSheet: build.query<CountSheet, { date: string; shift: CountShift }>({
      query: (params) => ({ url: '/counts/sheet', params }),
      providesTags: ['Counts'],
    }),
    saveCount: build.mutation<
      { id: string; lines: number },
      {
        sessionDate: string;
        shift: CountShift;
        lines: { itemId: string; countedQty: number; faultyQty?: number; notes?: string }[];
        responsibleName?: string;
        officerName?: string;
      }
    >({
      query: (body) => ({ url: '/counts', method: 'POST', body }),
      invalidatesTags: ['Counts', 'Reports'],
    }),

    // --- catalog management ---
    createItem: build.mutation<
      Item,
      {
        name: string;
        category: ItemCategory;
        isSerialized: boolean;
        inSummary?: boolean;
        authorizedQty: number;
        aliases?: string[];
      }
    >({
      query: (body) => ({ url: '/items', method: 'POST', body }),
      invalidatesTags: ['Items', 'Reports'],
    }),
    updateItem: build.mutation<Item, { id: string } & Partial<Item>>({
      query: ({ id, ...body }) => ({ url: `/items/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Items', 'Reports'],
    }),
    deletionCheck: build.query<DeletionCheck, string>({
      query: (id) => `/items/${id}/deletion-check`,
    }),
    deleteItem: build.mutation<{ deleted: true }, string>({
      query: (id) => ({ url: `/items/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Items', 'Reports'],
    }),
    addInstance: build.mutation<ItemInstance, { itemId: string; serial: string }>({
      query: ({ itemId, serial }) => ({
        url: `/items/${itemId}/instances`,
        method: 'POST',
        body: { serial },
      }),
      invalidatesTags: ['Items'],
    }),

    // --- attendance (ימי יציאה) ---
    week: build.query<Week, string>({
      query: (date) => ({ url: '/attendance/week', params: { date } }),
      providesTags: ['Attendance'],
    }),
    today: build.query<Today, void>({
      query: () => '/attendance/today',
      providesTags: ['Attendance'],
    }),
    latestCount: build.query<LatestCount, void>({
      query: () => '/counts/latest',
      providesTags: ['Counts'],
    }),
    teamMembers: build.query<TeamMember[], void>({
      query: () => '/attendance/members',
      providesTags: ['Attendance'],
    }),
    setAttendance: build.mutation<
      { saved: number },
      { cells: { teamMemberId: string; date: string; status: string | null; note?: string }[] }
    >({
      query: (body) => ({ url: '/attendance/cells', method: 'POST', body }),
      invalidatesTags: ['Attendance'],
    }),
    createTeamMember: build.mutation<
      TeamMember,
      { nickname: string; gender: 'M' | 'F'; fullName?: string }
    >({
      query: (body) => ({ url: '/attendance/members', method: 'POST', body }),
      invalidatesTags: ['Attendance'],
    }),

    // --- users ---
    users: build.query<PublicUser[], void>({
      query: () => '/users',
      providesTags: ['Users'],
    }),
    createUser: build.mutation<
      PublicUser & { generatedPassword?: string },
      { username: string; displayName: string; role: string; password?: string }
    >({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    updateUser: build.mutation<PublicUser, { id: string; displayName?: string; role?: string; isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Users'],
    }),
    resetPassword: build.mutation<{ password: string }, string>({
      query: (id) => ({ url: `/users/${id}/reset-password`, method: 'POST' }),
    }),

    // --- טופס 1008 ---
    kits: build.query<Kit[], void>({
      query: () => '/kits',
      providesTags: ['Kits'],
    }),
    createKit: build.mutation<Kit, { name: string; notes?: string; lines: { itemId: string; quantity: number }[] }>({
      query: (body) => ({ url: '/kits', method: 'POST', body }),
      invalidatesTags: ['Kits'],
    }),
    updateKit: build.mutation<
      Kit,
      { id: string; name?: string; notes?: string; isActive?: boolean; lines?: { itemId: string; quantity: number }[] }
    >({
      query: ({ id, ...body }) => ({ url: `/kits/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Kits'],
    }),
    deleteKit: build.mutation<{ deleted: true }, string>({
      query: (id) => ({ url: `/kits/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Kits'],
    }),

    issueForms: build.query<Paginated<IssueFormSummary>, { soldierId?: string; take?: number; skip?: number }>({
      query: (params) => ({ url: '/issue-forms', params }),
      providesTags: ['IssueForms'],
    }),
    issueForm: build.query<IssueForm, string>({
      query: (id) => `/issue-forms/${id}`,
      providesTags: ['IssueForms'],
    }),
    /** A whole handover against one signature — everything the 1008 covers. */
    createIssueForm: build.mutation<IssueForm, NewIssueForm>({
      query: (body) => ({ url: '/issue-forms', method: 'POST', body }),
      invalidatesTags: ['IssueForms', 'Signatures', 'Reports', 'Movements', 'Soldiers', 'Items'],
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
  useCountSheetQuery,
  useSaveCountMutation,
  useCreateItemMutation,
  useUpdateItemMutation,
  useLazyDeletionCheckQuery,
  useDeleteItemMutation,
  useAddInstanceMutation,
  useWeekQuery,
  useSoldierQuery,
  useUpdateSoldierMutation,
  useCreateSoldierMutation,
  useCheckDuplicateSoldierMutation,
  useTodayQuery,
  useLatestCountQuery,
  useTeamMembersQuery,
  useSetAttendanceMutation,
  useCreateTeamMemberMutation,
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  useKitsQuery,
  useCreateKitMutation,
  useUpdateKitMutation,
  useDeleteKitMutation,
  useIssueFormsQuery,
  useIssueFormQuery,
  useCreateIssueFormMutation,
} = api;
