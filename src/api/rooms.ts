import {apiRequest} from './client';
import type {
  MobileJoinResult,
  MobileWaitingStatusResponse,
  RoomSummary,
} from '../types/api';

export async function getRoom(publicId: string): Promise<RoomSummary> {
  const r = await apiRequest<{room: RoomSummary}>(
    `/api/mobile/rooms/${encodeURIComponent(publicId)}`,
  );
  return r.room;
}

export async function joinRoom(
  publicId: string,
  displayName: string,
  password?: string,
): Promise<MobileJoinResult> {
  return apiRequest<MobileJoinResult>(
    `/api/mobile/rooms/${encodeURIComponent(publicId)}/join`,
    {
      method: 'POST',
      body: JSON.stringify({
        display_name: displayName,
        ...(password ? {password} : {}),
      }),
    },
  );
}

export async function getWaitingRoomStatus(
  publicId: string,
  waitingToken: string,
): Promise<MobileWaitingStatusResponse> {
  return apiRequest<MobileWaitingStatusResponse>(
    `/api/mobile/rooms/${encodeURIComponent(publicId)}/waiting/${encodeURIComponent(waitingToken)}`,
  );
}
