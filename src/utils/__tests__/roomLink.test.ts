import {parseRoomPublicId} from '../roomLink';

describe('parseRoomPublicId', () => {
  it('extracts an id from a rooms URL', () => {
    expect(parseRoomPublicId('https://systemcall.example/rooms/abc123')).toBe(
      'abc123',
    );
  });

  it('extracts an id from a room URL', () => {
    expect(parseRoomPublicId('https://systemcall.example/room/demo-room')).toBe(
      'demo-room',
    );
  });

  it('supports a trailing slash', () => {
    expect(parseRoomPublicId('https://systemcall.example/rooms/abc123/')).toBe(
      'abc123',
    );
  });

  it('falls back to the last path segment while the public route is not frozen', () => {
    expect(parseRoomPublicId('https://systemcall.example/join/guest-room')).toBe(
      'guest-room',
    );
  });

  it('rejects empty and malformed values', () => {
    expect(parseRoomPublicId('')).toBeNull();
    expect(parseRoomPublicId('not a url')).toBeNull();
  });

  it('rejects unsupported protocols', () => {
    expect(parseRoomPublicId('ftp://systemcall.example/rooms/abc123')).toBeNull();
  });
});
