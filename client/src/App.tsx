import { useEffect } from 'react';
import { ConfigProvider, App as AntdApp, theme } from 'antd';
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
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#d4af37',
          colorBgBase: '#0d1117',
          colorBgContainer: '#161b22',
          colorBorder: '#30363d',
          colorText: '#c9d1d9',
          borderRadius: 6,
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <LogoutBinder />
            <AppRouter />
          </BrowserRouter>
          {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
