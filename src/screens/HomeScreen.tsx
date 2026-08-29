import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {FloatingLabelInput} from '../components/FloatingLabelInput';
import {PrimaryButton} from '../components/PrimaryButton';
import {getRoom} from '../api/rooms';
import {parseRoomPublicId} from '../utils/roomLink';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({navigation}: Props) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function go() {
    setError(null);
    const id = parseRoomPublicId(link);
    if (!id) {
      setError('Вставьте корректную ссылку на звонок.');
      return;
    }

    try {
      setLoading(true);
      const room = await getRoom(id);
      navigation.navigate('PreJoin', {
        publicId: id,
        roomName: room.name,
        hasPassword: room.has_password === true,
        waitingRoomEnabled: room.waiting_room_enabled === true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть комнату.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          bounces={false}>
          <View>
            <Text style={s.eyebrow}>SYSTEMCALL</Text>
            <Text style={s.title}>Войти в звонок</Text>
            <Text style={s.desc}>
              Скопируйте ссылку на комнату и вставьте её сюда.
            </Text>
          </View>

          <View style={s.form}>
            <FloatingLabelInput
              label="Ссылка на комнату"
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoComplete="off"
              onClear={() => {
                setLink('');
                setError(null);
              }}
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <PrimaryButton label="Продолжить" loading={loading} onPress={go} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b0b0b'},
  container: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  eyebrow: {
    color: '#777',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  title: {color: '#fff', fontSize: 36, fontWeight: '800'},
  desc: {color: '#989898', fontSize: 16, lineHeight: 23, marginTop: 12},
  form: {gap: 12},
  error: {color: '#ff7373'},
});
