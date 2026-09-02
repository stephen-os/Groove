// A stand-in for expo-sharing. The share sheet is the operating system's, so
// there is nothing to simulate beyond "it was offered, and with what".

let available = true;
const shared: { uri: string; mimeType?: string }[] = [];

export const inspect = {
  shared: (): { uri: string; mimeType?: string }[] => [...shared],
  reset: (): void => {
    shared.length = 0;
    available = true;
  },
  /** Some devices have no share target at all; the app has to say so. */
  setAvailable: (next: boolean): void => {
    available = next;
  },
};

export async function isAvailableAsync(): Promise<boolean> {
  return available;
}

export async function shareAsync(
  uri: string,
  options?: { mimeType?: string; dialogTitle?: string }
): Promise<void> {
  shared.push({ uri, ...(options?.mimeType ? { mimeType: options.mimeType } : {}) });
}
