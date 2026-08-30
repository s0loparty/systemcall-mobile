import React, {createContext, useContext, useMemo, useState} from 'react';
import {
  DEFAULT_CAMERA_QUALITY_PRESET_ID,
  type CameraQualityPresetId,
} from './cameraQuality';

type CameraSettingsValue = {
  qualityPresetId: CameraQualityPresetId;
  setQualityPresetId: (id: CameraQualityPresetId) => void;
};

const CameraSettingsContext = createContext<CameraSettingsValue | null>(null);

export function CameraSettingsProvider({children}: React.PropsWithChildren) {
  const [qualityPresetId, setQualityPresetId] = useState<CameraQualityPresetId>(
    DEFAULT_CAMERA_QUALITY_PRESET_ID,
  );
  const value = useMemo(
    () => ({qualityPresetId, setQualityPresetId}),
    [qualityPresetId],
  );

  return (
    <CameraSettingsContext.Provider value={value}>
      {children}
    </CameraSettingsContext.Provider>
  );
}

export function useCameraSettings(): CameraSettingsValue {
  const value = useContext(CameraSettingsContext);
  if (!value) {
    throw new Error('useCameraSettings must be used inside CameraSettingsProvider');
  }
  return value;
}
