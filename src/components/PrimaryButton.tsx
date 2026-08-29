import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
type Props = PressableProps & {
  label: string;
  loading?: boolean;
  danger?: boolean;
};
export function PrimaryButton({
  label,
  loading = false,
  danger = false,
  disabled,
  ...props
}: Props) {
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={({pressed}) => [
        s.button,
        danger && s.danger,
        (disabled || loading) && s.disabled,
        pressed && s.pressed,
      ]}>
      {loading ? <ActivityIndicator /> : <Text style={s.label}>{label}</Text>}
    </Pressable>
  );
}
const s = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  danger: {backgroundColor: '#e5484d'},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.82},
  label: {color: '#111', fontSize: 16, fontWeight: '700'},
});
