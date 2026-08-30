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

  it('uses medium 480p 15 FPS as the default', () => {
    expect(DEFAULT_CAMERA_QUALITY_PRESET_ID).toBe('medium');
    expect(
      getCameraQualityPreset(DEFAULT_CAMERA_QUALITY_PRESET_ID),
    ).toMatchObject({
      width: 854,
      height: 480,
      frameRate: 15,
    });
  });

  it('creates LiveKit capture options from the selected preset', () => {
    expect(getCameraCaptureOptions('medium', 'environment')).toEqual({
      facingMode: 'environment',
      resolution: {width: 854, height: 480, frameRate: 15},
    });
  });
});
