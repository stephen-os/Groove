import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { deleteItem, listItems, type Item } from '@/lib/db/items';
import { cancelReminder } from '@/lib/notifications';
import { spacing } from '@/lib/theme';

// Local calendar formatting. Unlike the web template's content dates, these are
// real instants (epoch ms from Date.now()), so rendering them in the device's
// own timezone is correct — pinning to UTC would show the wrong time.
const formatWhen = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function ItemsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Reload on focus rather than on mount: returning from the create screen has
  // to show the new item, and the tab stays mounted between visits.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listItems()
        .then((rows) => {
          if (active) {
            setItems(rows);
            setLoaded(true);
          }
        })
        .catch((error: unknown) => {
          console.error('Could not load items:', error);
          if (active) setLoaded(true);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const confirmDelete = useCallback((item: Item) => {
    Alert.alert('Delete item?', `"${item.title}" will be removed. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const remove = async (): Promise<void> => {
            // Cancel the OS reminder first. Deleting the row without this leaves
            // a scheduled notification for an item that no longer exists.
            if (item.notificationId) await cancelReminder(item.notificationId);
            await deleteItem(item.id);
            setItems((current) => current.filter((existing) => existing.id !== item.id));
          };
          remove().catch((error: unknown) => {
            console.error('Could not delete item:', error);
            Alert.alert('Could not delete that item.');
          });
        },
      },
    ]);
  }, []);

  return (
    <Screen edgeToEdgeBottom>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Text variant="heading">Nothing here yet</Text>
              <Text tone="muted">Add your first item to get started.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card>
            <Text variant="heading">{item.title}</Text>
            {item.body.length > 0 && <Text tone="muted">{item.body}</Text>}
            <Text variant="caption" tone="muted">
              {formatWhen(item.createdAt)}
            </Text>
            {item.remindAt !== null && (
              <Text variant="caption" tone="accent">
                Reminder {formatWhen(item.remindAt)}
              </Text>
            )}
            <Button
              label="Delete"
              tone="danger"
              onPress={() => confirmDelete(item)}
              accessibilityHint={`Deletes ${item.title}`}
              style={styles.deleteButton}
            />
          </Card>
        )}
      />

      <Button label="New item" onPress={() => router.push('/item/new')} style={styles.newButton} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingVertical: spacing.md },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  deleteButton: { marginTop: spacing.sm },
  newButton: { marginBottom: spacing.md },
});
