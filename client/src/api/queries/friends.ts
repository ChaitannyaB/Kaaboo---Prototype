import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { Friend, FriendRequest, SearchedUser } from '@/types/api';

export const friendsKeys = {
  friends: ['friends'] as const,
  requests: ['friend-requests'] as const,
  search: (q: string) => ['users', 'search', q] as const,
};

export function useFriends() {
  return useQuery({
    queryKey: friendsKeys.friends,
    queryFn: async () => {
      const r = await apiClient.get<{ friends: Friend[] }>('/api/users/friends');
      return r.data.friends;
    },
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: friendsKeys.requests,
    queryFn: async () => {
      const r = await apiClient.get<{ requests: FriendRequest[] }>('/api/users/friends/requests');
      return r.data.requests;
    },
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: friendsKeys.search(query),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiClient.get<{ users: SearchedUser[] }>('/api/users/search', {
        params: { q: query },
      });
      return r.data.users;
    },
  });
}

export function useSendFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (addresseeId: string) => {
      const r = await apiClient.post<{ ok: true }>('/api/users/friends/request', { addresseeId });
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: friendsKeys.requests });
      qc.invalidateQueries({ queryKey: ['users', 'search'] });
    },
  });
}

export function useRespondToRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; action: 'accept' | 'decline' }) => {
      const r = await apiClient.put<{ ok: true }>(`/api/users/friends/${args.id}`, { action: args.action });
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: friendsKeys.requests });
      qc.invalidateQueries({ queryKey: friendsKeys.friends });
    },
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      await apiClient.delete(`/api/users/friends/${friendshipId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: friendsKeys.friends }),
  });
}
