import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {LocalPreview} from '../call/LocalPreview';
import {QualityPresetOption} from './QualityPresetOption';
import {useCameraPreview} from '../../hooks/useCameraPreview';
import {useCameraSettings} from '../../settings/CameraSettingsContext';
import {CAMERA_QUALITY_PRESETS} from '../../settings/cameraQuality';

export function CameraQualitySection() {
  const {qualityPresetId, setQualityPresetId} = useCameraSettings();
  const {track, error} = useCameraPreview(qualityPresetId);

  return (
    <View style={s.section}>
      <View style={s.heading}>
        <Text style={s.title}>Камера</Text>
        <Text style={s.description}>
          Выберите качество видео. Изменение сразу видно в предпросмотре.
        </Text>
      </View>

      <View style={s.content}>
        <View style={s.options} accessibilityRole="radiogroup">
          {CAMERA_QUALITY_PRESETS.map(preset => (
            <QualityPresetOption
              key={preset.id}
              preset={preset}
              selected={qualityPresetId === preset.id}
              onPress={() => setQualityPresetId(preset.id)}
            />
          ))}
        </View>
        <View style={s.previewColumn}>
          <Text style={s.previewLabel}>Предпросмотр</Text>
          <View style={s.preview}>
            <LocalPreview track={track} enabled={!!track} />
          </View>
          {error ? <Text style={s.error}>{error}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: {
    gap: 18,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#202020',
  },
  heading: {gap: 6},
  title: {color: '#fff', fontSize: 20, fontWeight: '800'},
  description: {color: '#888', fontSize: 14, lineHeight: 20},
  content: {flexDirection: 'row', gap: 14, alignItems: 'stretch'},
  options: {flex: 1, gap: 8},
  previewColumn: {width: 132, gap: 8},
  previewLabel: {color: '#aaa', fontSize: 12, fontWeight: '700'},
  preview: {height: 210},
  error: {color: '#ff7373', fontSize: 12, lineHeight: 16},
});
