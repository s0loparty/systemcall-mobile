export type RoomSummary={public_id:string;name:string;description?:string|null;status?:string;has_password?:boolean;waiting_room_enabled?:boolean};
export type LiveKitCredentials={url:string;token:string;room_name:string;identity:string;expires_in:number};
export type MobileJoinResponse={room:RoomSummary;member:{id:number|string;display_name:string;livekit_identity:string};livekit:LiveKitCredentials};
