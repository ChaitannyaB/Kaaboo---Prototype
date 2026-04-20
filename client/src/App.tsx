import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from '@/routes/AppRouter';
import { registerLogoutHandler } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
    mutations: { retry: 0 },
  },
});

function LogoutBinder() {
  const logout = useAuthStore((s) => s.logout);
  useEffect(() => {
    registerLogoutHandler(() => {
      logout();
      queryClient.clear();
    });
  }, [logout]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LogoutBinder />
        <AppRouter />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
