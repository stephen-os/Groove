# Palette archive

Superseded colour schemes, kept so a look can be put back without digging
through git. Nothing here is imported — it is a record, not a module.

## Blue-grey charcoal + bright ember (the first dark theme)

The original scheme. Its greys carried a blue cast (`#1d2025` is measurably
blue-leaning), which read as navy rather than as neutral charcoal, and the
orange was bright enough to glare against it.

```ts
const slate = {
  lift: '#32363e',
  shade: '#0e1013',
  recess: '#16181c',
  page: '#1d2025',
  pageLight: '#23272e',
  pageDark: '#191c21',
  surfaceLight: '#22252b',
  surfaceDark: '#1b1e23',
  border: '#33373f',
  borderStrong: '#767b85',
  muted: '#9aa0aa',
  fg: '#eef0f3',
};

const hue = {
  ember: '#ff8a3d',
  emberLight: '#ffa563',
  emberDark: '#f0741f',
  emberDim: '#c25a18',
  sage: '#5bd88a',
  rose: '#f98a8a',
  roseLight: '#ffa3a3',
  roseDark: '#e46b6b',
  amber: '#f2c94c',
};

// The accent gradient, which ran a wide and bright ramp.
accent: ['#ffa563', '#f0741f'],
```

Habit tints at the time — the first entry was the accent itself, which is why
changing the accent used to change what colour a habit was drawn in:

```ts
const HABIT_COLORS = ['#ff8a3d', '#f2c94c', '#5bd88a', '#4ecdc4',
                      '#6db3f2', '#b48ef0', '#f98a8a'];
```
