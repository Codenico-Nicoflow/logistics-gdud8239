import { createApi, fetchBaseQuery, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type {
  AuthUser,
  Company,
  CountSheet,
  CountShift,
  DeletionCheck,
  ItemCategory,
  InstanceStatus,
  DbBackup,
  PublicUser,
  TeamMember,
  Week,
  Item,
  ItemInstance,
  MatrixRow,
  MovementAction,
  MovementRow,
  Paginated,
  Signature,
  SoldierSummary,
  Snapshot,
  SummaryRow,
  MesakemSheet,
  RecentCountSession,
  NewSoldier,
  SoldierDetail,
  ServicePeriod,
  NewServicePeriod,
  CompanyAllocationRow,
  CompanySoldierRef,
  SoldierAllocationRow,
  IssueForm,
  IssueFormSummary,
  NewIssueForm,
  NewIntake,
  IntakeResult,
  ItemDetail,
  IssueBundleLine,
  AvailableInstance,
  SignatureHolder,
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
    'DbBackups',
    'Counts',
    'Mesakem',
    'Attendance',
    'Users',
    'ServicePeriods',
    'Allocations',
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
      // `invalidatesTags` alone only refetches; on a failed refetch RTK Query
      // keeps the previous successful `me` payload in `data` rather than
      // clearing it, so `App.tsx`'s `!data?.user` check never saw the logout
      // until a full page reload rebuilt the store from scratch. Wiping the
      // whole cache forces every query, `me` included, to start from nothing.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(api.util.resetApiState());
      },
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
        sort?: 'name' | 'company';
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
    setSoldierEnlisted: build.mutation<{ isEnlisted: boolean }, { id: string; enlisted: boolean }>({
      query: ({ id, enlisted }) => ({
        url: `/soldiers/${id}/enlistment`,
        method: 'PATCH',
        body: { enlisted },
      }),
      invalidatesTags: ['Soldiers'],
    }),
    deleteSoldier: build.mutation<void, string>({
      query: (id) => ({ url: `/soldiers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Soldiers'],
    }),

    // --- items ---
    items: build.query<Item[], void>({
      query: () => '/items',
      providesTags: ['Items'],
    }),
    item: build.query<ItemDetail, string>({
      query: (id) => `/items/${id}`,
      providesTags: ['Items', 'Signatures'],
    }),
    availableInstances: build.query<
      AvailableInstance[],
      { itemId: string; soldierId?: string }
    >({
      query: ({ itemId, soldierId }) => ({
        url: `/items/${itemId}/available`,
        params: soldierId ? { soldierId } : undefined,
      }),
      providesTags: ['Items', 'Signatures'],
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
        take?: number;
        skip?: number;
      }
    >({
      query: (params) => ({ url: '/signatures', params }),
      providesTags: ['Signatures'],
    }),
    signatureHolders: build.query<
      Paginated<SignatureHolder>,
      {
        q?: string;
        company?: Company;
        itemId?: string;
        take?: number;
        skip?: number;
      }
    >({
      query: (params) => ({ url: '/signatures/holders', params }),
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

    // --- reports ---
    summary: build.query<SummaryRow[], void>({
      query: () => '/reports/summary',
      providesTags: ['Reports'],
    }),

    // --- מסכם (editable daily armory headcount) ---
    mesakemSheet: build.query<MesakemSheet, { date: string }>({
      query: ({ date }) => ({ url: '/mesakem/sheet', params: { date } }),
      providesTags: ['Mesakem'],
    }),
    saveMesakem: build.mutation<
      { saved: number },
      { sessionDate: string; lines: { itemId: string; nashkiyaQty: number }[] }
    >({
      query: (body) => ({ url: '/mesakem', method: 'POST', body }),
      invalidatesTags: ['Mesakem', 'Reports', 'Counts'],
    }),
    finishMesakemDay: build.mutation<{ sent: boolean; error?: string }, { sessionDate: string }>({
      query: (body) => ({ url: '/mesakem/finish-day', method: 'POST', body }),
      invalidatesTags: ['Mesakem'],
    }),
    companyMatrix: build.query<MatrixRow[], void>({
      query: () => '/reports/companies',
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

    // --- db backups (full pg_dump, separate from the xlsx snapshots above) ---
    dbBackups: build.query<DbBackup[], void>({
      query: () => '/db-backups',
      providesTags: ['DbBackups'],
    }),
    createDbBackup: build.mutation<{ id: string }, void>({
      query: () => ({ url: '/db-backups', method: 'POST' }),
      invalidatesTags: ['DbBackups'],
    }),
    sendDbBackupToSlack: build.mutation<{ sent: boolean; error?: string }, string>({
      query: (id) => ({ url: `/db-backups/${id}/send-to-slack`, method: 'POST' }),
      invalidatesTags: ['DbBackups'],
    }),

    // --- counts (ספירת נשקיה) ---
    countSheet: build.query<CountSheet, { date: string; shift: CountShift }>({
      query: (params) => ({ url: '/counts/sheet', params }),
      providesTags: ['Counts'],
    }),
    saveCount: build.mutation<
      { id: string },
      {
        sessionDate: string;
        shift: CountShift;
        responsibleName?: string;
        responsiblePn?: string;
        responsibleRank?: string;
        responsibleSignatureImage?: string;
        officerName?: string;
        officerPn?: string;
        officerRank?: string;
        officerSignatureImage?: string;
      }
    >({
      query: (body) => ({ url: '/counts', method: 'POST', body }),
      invalidatesTags: ['Counts', 'Reports'],
    }),
    closeCount: build.mutation<{ id: string; isClosed: boolean }, string>({
      query: (id) => ({ url: `/counts/${id}/close`, method: 'POST' }),
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
        yamahQty?: number;
        repairQty?: number;
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
    removeInstance: build.mutation<{ removed: true }, string>({
      query: (instanceId) => ({ url: `/items/instances/${instanceId}`, method: 'DELETE' }),
      invalidatesTags: ['Items'],
    }),
    setInstanceStatus: build.mutation<
      ItemInstance,
      { instanceId: string; status: InstanceStatus; notes?: string }
    >({
      query: ({ instanceId, ...body }) => ({
        url: `/items/instances/${instanceId}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Items', 'Reports'],
    }),

    // --- attendance (ימי יציאה) ---
    week: build.query<Week, string>({
      query: (date) => ({ url: '/attendance/week', params: { date } }),
      providesTags: ['Attendance'],
    }),
    recentCounts: build.query<RecentCountSession[], void>({
      query: () => '/counts/recent',
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
      { username: string; displayName: string; role: string; companyScope?: Company; password?: string }
    >({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    updateUser: build.mutation<
      PublicUser,
      {
        id: string;
        displayName?: string;
        role?: string;
        companyScope?: Company | null;
        isActive?: boolean;
        isSuperAdmin?: boolean;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Users'],
    }),
    resetPassword: build.mutation<{ password: string }, string>({
      query: (id) => ({ url: `/users/${id}/reset-password`, method: 'POST' }),
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Users'],
    }),

    // --- תקופת שרות: הקצאות ---
    servicePeriods: build.query<ServicePeriod[], void>({
      query: () => '/service-periods',
      providesTags: ['ServicePeriods'],
    }),
    activeServicePeriod: build.query<ServicePeriod | null, void>({
      query: () => '/service-periods/active',
      providesTags: ['ServicePeriods'],
    }),
    createServicePeriod: build.mutation<ServicePeriod, NewServicePeriod>({
      query: (body) => ({ url: '/service-periods', method: 'POST', body }),
      invalidatesTags: ['ServicePeriods'],
    }),
    updateServicePeriod: build.mutation<ServicePeriod, { id: string } & Partial<NewServicePeriod & { status: string }>>({
      query: ({ id, ...body }) => ({ url: `/service-periods/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ServicePeriods'],
    }),

    companyAllocations: build.query<CompanyAllocationRow[], string>({
      query: (servicePeriodId) => `/service-periods/${servicePeriodId}/company-allocations`,
      providesTags: ['Allocations'],
    }),
    setCompanyAllocation: build.mutation<
      { id: string; quantity: number },
      { servicePeriodId: string; itemId: string; company: Company; quantity: number }
    >({
      query: ({ servicePeriodId, ...body }) => ({
        url: `/service-periods/${servicePeriodId}/company-allocations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Allocations'],
    }),
    addGridItem: build.mutation<void, { servicePeriodId: string; itemId: string }>({
      query: ({ servicePeriodId, itemId }) => ({
        url: `/service-periods/${servicePeriodId}/company-allocations/items`,
        method: 'POST',
        body: { itemId },
      }),
      invalidatesTags: ['Allocations'],
    }),
    removeGridItem: build.mutation<void, { servicePeriodId: string; itemId: string }>({
      query: ({ servicePeriodId, itemId }) => ({
        url: `/service-periods/${servicePeriodId}/company-allocations/items/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Allocations'],
    }),
    setOnHandOverride: build.mutation<
      { onHand: number; onHandOverride: number | null },
      { servicePeriodId: string; itemId: string; onHand: number | null }
    >({
      query: ({ servicePeriodId, ...body }) => ({
        url: `/service-periods/${servicePeriodId}/on-hand-override`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Allocations'],
    }),

    // --- soldier allocations (סגן מפקד פלוגה) ---
    soldierAllocations: build.query<SoldierAllocationRow[], { servicePeriodId: string; company?: Company }>({
      query: ({ servicePeriodId, company }) => ({
        url: `/service-periods/${servicePeriodId}/soldier-allocations`,
        params: company ? { company } : undefined,
      }),
      providesTags: ['Allocations'],
    }),
    companySoldiers: build.query<CompanySoldierRef[], { servicePeriodId: string; company?: Company }>({
      query: ({ servicePeriodId, company }) => ({
        url: `/service-periods/${servicePeriodId}/soldier-allocations/soldiers`,
        params: company ? { company } : undefined,
      }),
      providesTags: ['Soldiers'],
    }),
    setSoldierAllocation: build.mutation<
      { id: string; quantity: number },
      { servicePeriodId: string; itemId: string; soldierId: string; quantity: number }
    >({
      query: ({ servicePeriodId, ...body }) => ({
        url: `/service-periods/${servicePeriodId}/soldier-allocations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Allocations'],
    }),

    // A personal weapon or נגב going into the basket pulls in its standard
    // accessories plus anything the soldier's own חלוקה לפי חייל says he's
    // getting this period (מטולון, מכפל, שחמ, etc). Every soldier allocation
    // mutation invalidates `Allocations`, so this refetches whenever a
    // סגן מפקד פלוגה changes what the soldier is eligible for.
    issueBundle: build.query<IssueBundleLine[], { itemName: string; soldierId: string; alwaysOnly?: boolean }>({
      query: ({ itemName, soldierId, alwaysOnly }) => ({
        url: '/issue-bundle',
        params: { itemName, soldierId, ...(alwaysOnly ? { alwaysOnly: 'true' } : {}) },
      }),
      providesTags: ['Allocations'],
    }),
    itemPairings: build.query<IssueBundleLine[], string>({
      query: (itemName) => ({ url: '/item-pairings', params: { itemName } }),
      providesTags: ['Allocations'],
    }),

    // Everything this soldier is entitled to this period — drives the
    // pre-populated pick-list at the top of the ניפוק basket step.
    soldierEntitlement: build.query<IssueBundleLine[], string>({
      query: (soldierId) => `/soldiers/${soldierId}/entitlement`,
      providesTags: ['Allocations'],
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
    /** Header-only edit (מס קבלה / הערות) — never the lines, soldier, or
     *  signature, since those are what was actually signed. */
    updateIssueForm: build.mutation<IssueForm, { id: string; receiptNo?: string; notes?: string }>({
      query: ({ id, ...body }) => ({ url: `/issue-forms/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['IssueForms'],
    }),
    /** A real change to a signed form's items/serials/quantities — returns
     *  whatever the new lines no longer cover and signs a brand new 1008. */
    reissueIssueForm: build.mutation<IssueForm, { id: string } & NewIssueForm>({
      query: ({ id, ...body }) => ({ url: `/issue-forms/${id}/reissue`, method: 'POST', body }),
      invalidatesTags: ['IssueForms', 'Signatures', 'Reports', 'Movements', 'Soldiers', 'Items'],
    }),

    // --- קליטת ציוד ---
    submitIntake: build.mutation<IntakeResult, NewIntake>({
      query: (body) => ({ url: '/intake', method: 'POST', body }),
      invalidatesTags: ['Items', 'Reports'],
    }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useSoldiersQuery,
  useItemsQuery,
  useItemQuery,
  useAvailableInstancesQuery,
  useSignaturesQuery,
  useSignatureHoldersQuery,
  useIssueItemMutation,
  useReturnItemMutation,
  useSummaryQuery,
  useMesakemSheetQuery,
  useSaveMesakemMutation,
  useFinishMesakemDayMutation,
  useCompanyMatrixQuery,
  useMovementsQuery,
  useSnapshotsQuery,
  useCreateSnapshotMutation,
  useSendSnapshotToSlackMutation,
  useDbBackupsQuery,
  useCreateDbBackupMutation,
  useSendDbBackupToSlackMutation,
  useCountSheetQuery,
  useSaveCountMutation,
  useCloseCountMutation,
  useCreateItemMutation,
  useUpdateItemMutation,
  useLazyDeletionCheckQuery,
  useDeleteItemMutation,
  useAddInstanceMutation,
  useRemoveInstanceMutation,
  useSetInstanceStatusMutation,
  useWeekQuery,
  useSoldierQuery,
  useUpdateSoldierMutation,
  useCreateSoldierMutation,
  useCheckDuplicateSoldierMutation,
  useSetSoldierEnlistedMutation,
  useDeleteSoldierMutation,
  useRecentCountsQuery,
  useTeamMembersQuery,
  useSetAttendanceMutation,
  useCreateTeamMemberMutation,
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  useDeleteUserMutation,
  useServicePeriodsQuery,
  useActiveServicePeriodQuery,
  useCreateServicePeriodMutation,
  useUpdateServicePeriodMutation,
  useCompanyAllocationsQuery,
  useSetCompanyAllocationMutation,
  useAddGridItemMutation,
  useRemoveGridItemMutation,
  useSetOnHandOverrideMutation,
  useSoldierAllocationsQuery,
  useCompanySoldiersQuery,
  useSetSoldierAllocationMutation,
  useIssueBundleQuery,
  useLazyIssueBundleQuery,
  useLazyItemPairingsQuery,
  useSoldierEntitlementQuery,
  useIssueFormsQuery,
  useIssueFormQuery,
  useCreateIssueFormMutation,
  useUpdateIssueFormMutation,
  useReissueIssueFormMutation,
  useSubmitIntakeMutation,
} = api;
