import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { PublicRoom } from '@/types/api';

export function usePublicRooms(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['rooms'],
    enabled: options.enabled ?? true,
    refetchInterval: 4000,
    queryFn: async () => {
      const r = await apiClient.get<{ rooms: PublicRoom[] }>('/api/rooms');
      return r.data.rooms;
    },
  });
}
