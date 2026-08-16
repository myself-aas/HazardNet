import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Placeholder for RTK Query or React Query API service
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: () => ({}),
});
