export type CameraQualityPresetId = 'low' | 'medium' | 'high' | 'highest';

export type CameraQualityPreset = {
  id: CameraQualityPresetId;
  label: string;
  description: string;
  width: number;
  height: number;
  frameRate: number;
};

export const CAMERA_QUALITY_PRESETS: readonly CameraQualityPreset[] = [
  {
    id: 'low',
    label: 'Слабое',
    description: '360p · 15 FPS',
    width: 640,
    height: 360,
    frameRate: 15,
  },
  {
    id: 'medium',
    label: 'Среднее',
    description: '480p · 30 FPS',
    width: 854,
    height: 480,
    frameRate: 30,
  },
  {
    id: 'high',
    label: 'Высокое',
    description: '720p · 30 FPS · рекомендуется',
    width: 1280,
    height: 720,
    frameRate: 30,
  },
  {
    id: 'highest',
    label: 'Наивысшее',
    description: '1080p · 30 FPS · высокая нагрузка',
    width: 1920,
    height: 1080,
    frameRate: 30,
  },
] as const;

export const DEFAULT_CAMERA_QUALITY_PRESET_ID: CameraQualityPresetId = 'high';

export function getCameraQualityPreset(
  id: CameraQualityPresetId,
): CameraQualityPreset {
  return (
    CAMERA_QUALITY_PRESETS.find(preset => preset.id === id) ??
    CAMERA_QUALITY_PRESETS[2]
  );
}

export function getCameraCaptureOptions(
  id: CameraQualityPresetId,
  facingMode: 'user' | 'environment' = 'user',
) {
  const preset = getCameraQualityPreset(id);
  return {
    facingMode,
    resolution: {
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate,
    },
  };
}
