import React, {useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
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
      if (room.waiting_room_enabled) {
        setError('Комнаты с залом ожидания пока не поддерживаются в MVP.');
        return;
      }
      navigation.navigate('PreJoin', {publicId: id, roomName: room.name});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть комнату.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>
        <View>
          <Text style={s.eyebrow}>SYSTEMCALL</Text>
          <Text style={s.title}>Войти в звонок</Text>
          <Text style={s.desc}>
            Скопируйте ссылку на комнату и вставьте её сюда.
          </Text>
        </View>
        <View style={s.form}>
          <TextInput
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://…/rooms/abc123"
            placeholderTextColor="#666"
            style={s.input}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <PrimaryButton label="Продолжить" loading={loading} onPress={go} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0b0b0b'},
  container: {
    flex: 1,
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
  input: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#171717',
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 16,
  },
  error: {color: '#ff7373'},
});
