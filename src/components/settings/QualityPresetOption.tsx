import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {CameraQualityPreset} from '../../settings/cameraQuality';

type Props = {
  preset: CameraQualityPreset;
  selected: boolean;
  onPress: () => void;
};

export function QualityPresetOption({preset, selected, onPress}: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[s.option, selected && s.selected]}>
      <View style={[s.radio, selected && s.radioSelected]}>
        {selected ? <View style={s.dot} /> : null}
      </View>
      <View style={s.copy}>
        <Text style={s.label}>{preset.label}</Text>
        <Text style={s.description}>{preset.description}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252525',
    backgroundColor: '#151515',
  },
  selected: {borderColor: '#5f5f5f', backgroundColor: '#1c1c1c'},
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#5d5d5d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {borderColor: '#fff'},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff'},
  copy: {flex: 1, gap: 2},
  label: {color: '#fff', fontSize: 15, fontWeight: '700'},
  description: {color: '#888', fontSize: 13},
});
