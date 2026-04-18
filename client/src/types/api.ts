export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface SearchedUser {
  id: string;
  username: string;
}

export type FriendshipStatus = 'PENDING' | 'ACCEPTED';

export interface FriendRequest {
  id: string;
  userId: string;
  username: string;
}

export interface Friend {
  id: string;
  friendshipId: string;
  username: string;
  online: boolean;
}

export interface GameInvite {
  id: string;
  roomId: string;
  inviterUsername: string;
  createdAt: number;
}

export interface PublicRoom {
  roomId: string;
  host: string;
  playerCount: number;
  maxPlayers: number;
}

export interface StatsBody {
  roundsPlayed: number;
  kaabooCalls: number;
  kaabooWins: number;
  kaabooLosses: number;
  scoreboard: number;
  winRate: number | null;
  bestCardScore: number | null;
  avgCardScore?: number | null;
  playdownsAttempted?: number;
  playdownsSucceeded?: number;
  penaltiesReceived?: number;
  playdownAccuracy?: number | null;
  powersUsed?: number;
  powersSkipped?: number;
}

export interface StatsResponse {
  username?: string;
  stats: StatsBody;
}

export interface ApiError {
  message: string;
  status?: number;
}
