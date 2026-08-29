import React, {useMemo, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {XMarkIcon} from 'react-native-heroicons/mini';

type Props = TextInputProps & {
  label: string;
  onClear?: () => void;
};

export function FloatingLabelInput({
  label,
  value,
  style,
  onFocus,
  onBlur,
  onClear,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const hasValue = useMemo(() => String(value ?? '').length > 0, [value]);
  const shouldFloat = focused || hasValue;

  return (
    <View style={[s.field, focused && s.fieldFocused]}>
      <Text style={[s.label, shouldFloat && s.labelFloating]}>{label}</Text>
      <TextInput
        {...props}
        value={value}
        style={[s.input, style]}
        placeholder={shouldFloat ? undefined : label}
        placeholderTextColor="#666"
        onFocus={event => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={event => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {onClear && hasValue ? (
        <Pressable hitSlop={10} onPress={onClear} style={s.clearButton}>
          <XMarkIcon size={16} color="#b7b7b7" />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#171717',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  fieldFocused: {
    // borderWidth: 1,
    // borderColor: '#4f8cff',
  },
  label: {
    position: 'absolute',
    left: 16,
    top: 18,
    color: '#8b8b8b',
    fontSize: 16,
  },
  labelFloating: {
    top: -10,
    fontSize: 14,
    color: '#ffffff',
  },
  input: {
    color: '#fff',
    fontSize: 16,
    padding: 0,
    paddingRight: 76,
  },
  clearButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  clearText: {
    color: '#b7b7b7',
  },
});
