import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { GameInvite } from '@/types/api';

export const inviteKeys = {
  all: ['invites'] as const,
};

export function useInvites() {
  return useQuery({
    queryKey: inviteKeys.all,
    queryFn: async () => {
      const r = await apiClient.get<{ invites: GameInvite[] }>('/api/users/invites');
      return r.data.invites;
    },
  });
}

export function useSendInvite() {
  return useMutation({
    mutationFn: async (args: { roomId: string; inviteeId: string }) => {
      const r = await apiClient.post<{ ok: true }>('/api/users/invites', args);
      return r.data;
    },
  });
}

export function useDismissInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/users/invites/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: inviteKeys.all }),
  });
}
