import {apiRequest} from './client';
import type {MobileJoinResponse,RoomSummary} from '../types/api';
export async function getRoom(publicId:string):Promise<RoomSummary>{const r=await apiRequest<{room:RoomSummary}>(`/api/mobile/rooms/${encodeURIComponent(publicId)}`);return r.room}
export async function joinRoom(publicId:string,displayName:string):Promise<MobileJoinResponse>{return apiRequest<MobileJoinResponse>(`/api/mobile/rooms/${encodeURIComponent(publicId)}/join`,{method:'POST',body:JSON.stringify({display_name:displayName})})}
