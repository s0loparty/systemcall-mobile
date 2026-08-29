export type RoomSummary = {
  public_id: string;
  name: string;
  description?: string | null;
  visibility?: string;
  status?: string;
  has_password?: boolean;
  waiting_room_enabled?: boolean;
  max_participants?: number;
  ended_at?: string | null;
};

export type LiveKitCredentials = {
  url: string;
  token: string;
  room_name: string;
  identity: string;
  expires_in: number;
};

export type RoomMemberSummary = {
  id: number | string;
  display_name: string;
  livekit_identity: string;
};

export type WaitingRoomSummary = {
  id: number | string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
};

export type MobileJoinResponse = {
  room: RoomSummary;
  member: RoomMemberSummary;
  livekit: LiveKitCredentials;
};

export type MobileWaitingJoinResponse = {
  room: RoomSummary;
  waiting_room: WaitingRoomSummary;
  waiting_token: string;
};

export type MobileJoinResult = MobileJoinResponse | MobileWaitingJoinResponse;

export type MobileWaitingStatusResponse = {
  room: RoomSummary;
  waiting_room: WaitingRoomSummary;
  member?: RoomMemberSummary;
  livekit?: LiveKitCredentials;
};
