import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
export function MediaToggle({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.button, active && s.active]}>
      <Text style={s.icon}>{active ? '●' : '○'}</Text>
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  button: {
    minWidth: 92,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  active: {backgroundColor: '#3a3a3a'},
  icon: {color: '#fff', fontSize: 12},
  label: {color: '#fff', fontSize: 13, fontWeight: '600'},
});
