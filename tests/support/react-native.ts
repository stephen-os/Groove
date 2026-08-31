// The sliver of react-native that `src/lib` touches at runtime.
//
// Only `Platform`, and only because notifications.ts creates an Android channel.
// Aliasing the whole package is not an option: its source is Flow, which Node
// cannot parse, so importing it fails before any test runs. Everything else the
// app takes from react-native is a type (see theme.ts) and costs nothing here.
//
// Android, because that is the only platform this app is built for.
export const Platform = { OS: 'android' as const, select: <T,>(spec: { android?: T; default?: T }): T | undefined => spec.android ?? spec.default };
