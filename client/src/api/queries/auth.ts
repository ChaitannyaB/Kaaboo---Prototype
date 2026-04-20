import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@/types/api';
import { useAuthStore } from '@/stores/authStore';

export function useLogin() {
  const setAuth = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const r = await apiClient.post<AuthResponse>('/api/auth/login', data);
      return r.data;
    },
    onSuccess: (res) => setAuth(res.user, res.token),
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const r = await apiClient.post<AuthResponse>('/api/auth/register', data);
      return r.data;
    },
    onSuccess: (res) => setAuth(res.user, res.token),
  });
}

export function useDeleteAccount() {
  const logout = useAuthStore((s) => s.logout);
  return useMutation({
    mutationFn: async (password: string) => {
      await apiClient.delete('/api/users/me', { data: { password } });
    },
    onSuccess: () => logout(),
  });
}
