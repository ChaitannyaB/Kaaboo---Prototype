import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { StatsResponse } from '@/types/api';

export function useMyStats() {
  return useQuery({
    queryKey: ['stats', 'me'],
    queryFn: async () => {
      const r = await apiClient.get<StatsResponse>('/api/users/me/stats');
      return r.data;
    },
  });
}

export function useUserStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await apiClient.get<StatsResponse>(`/api/users/${userId}/stats`);
      return r.data;
    },
  });
}
