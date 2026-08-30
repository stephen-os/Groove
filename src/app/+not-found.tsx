import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/lib/theme';

// Rendered for any route that doesn't exist. Reachable in a shipped app through
// a deep link that no longer resolves, so it needs a way back rather than a
// dead end.
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen style={styles.screen}>
      <Text variant="title">Not found</Text>
      <Text tone="muted">That screen doesn&apos;t exist.</Text>
      <Button label="Go home" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center', gap: spacing.md },
});
