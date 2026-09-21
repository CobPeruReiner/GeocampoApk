import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { Page } from '@/features/field/ui';
import { useFieldSession } from '@/features/field/session';
import { palette } from '@/theme/tokens';

export default function EntryScreen() {
  const { ready, profile } = useFieldSession();
  if (!ready) return <Page><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={palette.red} /></View></Page>;
  return <Redirect href={profile ? '/home' : '/sign-in'} />;
}
