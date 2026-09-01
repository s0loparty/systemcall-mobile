import {
  CAMERA_QUALITY_PRESETS,
  DEFAULT_CAMERA_QUALITY_PRESET_ID,
  getCameraCaptureOptions,
  getCameraQualityPreset,
} from './cameraQuality';

describe('camera quality presets', () => {
  it('defines four ordered quality levels', () => {
    expect(CAMERA_QUALITY_PRESETS.map(preset => preset.id)).toEqual([
      'low',
      'medium',
      'high',
      'highest',
    ]);
  });

  it('uses high 720p 30 FPS as the default', () => {
    expect(DEFAULT_CAMERA_QUALITY_PRESET_ID).toBe('high');
    expect(
      getCameraQualityPreset(DEFAULT_CAMERA_QUALITY_PRESET_ID),
    ).toMatchObject({
      width: 1280,
      height: 720,
      frameRate: 30,
    });
  });

  it('creates LiveKit capture options from the selected preset', () => {
    expect(getCameraCaptureOptions('medium', 'environment')).toEqual({
      facingMode: 'environment',
      resolution: {width: 854, height: 480, frameRate: 30},
    });
  });
});
