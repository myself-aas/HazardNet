const React = require('react');
module.exports = {
  QueryClient: class {
    constructor() {
      this.invalidateQueries = async () => {};
      this.setQueryData = () => {};
      this.getQueryData = () => undefined;
      this.fetchQuery = async () => null;
    }
  },
  QueryClientProvider: ({ children }) => React.createElement('div', { 'data-testid': 'query-provider' }, children),
  useQuery: () => ({ data: undefined, isLoading: false, error: null, dataUpdatedAt: 0 }),
  useMutation: () => ({ mutate: () => {}, mutateAsync: async () => {}, isLoading: false }),
  useQueryClient: () => new (module.exports.QueryClient)(),
  keepPreviousData: Symbol('keepPreviousData'),
};
