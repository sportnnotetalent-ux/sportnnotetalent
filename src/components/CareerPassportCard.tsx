/** "Career passport" on your own profile — your verified record to send to a
 *  selector, coach or scholarship panel (link, QR or print). */
import React from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import type { RootStackParamList } from '../navigation/types';

export function CareerPassportCard({ playerId }: { playerId: string }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>Career passport</Text>
      <Text style={textStyles.muted}>Your official record and honours on one page, with a QR anyone can check — for selectors, coaches and scholarships.</Text>
      <Button label="Open my passport" variant="ghost" onPress={() => nav.navigate('Passport', { playerId })} />
    </Card>
  );
}
