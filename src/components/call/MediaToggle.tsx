import React, {type ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

type Props = {
  label: string;
  active: boolean;
  icon: ReactNode;
  onPress: () => void;
};

export function MediaToggle({label, active, icon, onPress}: Props) {
  return (
    <Pressable onPress={onPress} style={[s.button, active && s.active]}>
      <View style={s.iconWrap}>{icon}</View>
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
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
    gap: 5,
  },
  active: {backgroundColor: '#3a3a3a'},
  iconWrap: {height: 20, alignItems: 'center', justifyContent: 'center'},
  label: {color: '#fff', fontSize: 13, fontWeight: '600'},
});
