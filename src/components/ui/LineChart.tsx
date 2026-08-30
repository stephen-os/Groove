import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line as SvgLine } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { areaPath, labelIndices, plot, smoothPath, yFor, Y_TICKS, type PlotBox } from '@/lib/chart';
import { colors, spacing } from '@/lib/theme';

// A percentage over time, drawn the way a chart of anything else would be:
// gridlines, a labelled axis, a smooth line and a filled area under it.
//
// The geometry all comes from lib/chart.ts, which is pure and tested. This file
// only turns points into elements.

const HEIGHT = 190;

interface LineChartProps {
  /** One value per point, each 0–100. */
  values: readonly number[];
  /** Labels for the horizontal axis, one per value; a few are shown. */
  labels: readonly string[];
  /** Drawn in this colour, area included. */
  tint?: string;
  accessibilityLabel: string;
}

export function LineChart({
  values,
  labels,
  tint = colors.accent,
  accessibilityLabel,
}: LineChartProps) {
  // A viewBox in fixed units with preserveAspectRatio off means the chart
  // stretches to whatever width it is given without any measurement pass.
  const box: PlotBox = {
    width: 320,
    height: HEIGHT,
    padLeft: 34,
    padRight: 8,
    padTop: 10,
    padBottom: 22,
  };

  const points = plot(values, box);
  const baseline = yFor(0, box);
  const last = points[points.length - 1];
  const ticks = labelIndices(labels.length, 4);

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text tone="muted">Not enough history yet.</Text>
      </View>
    );
  }

  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${box.width} ${box.height}`}>
        <Defs>
          <LinearGradient id="under" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={0.35} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {Y_TICKS.map((tick) => (
          <SvgLine
            key={tick}
            x1={box.padLeft}
            x2={box.width - box.padRight}
            y1={yFor(tick, box)}
            y2={yFor(tick, box)}
            stroke={colors.border}
            strokeWidth={0.5}
          />
        ))}

        <Path d={areaPath(points, baseline)} fill="url(#under)" />
        <Path
          d={smoothPath(points)}
          stroke={tint}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* The latest reading is the one the eye should land on. */}
        <Circle cx={last.x} cy={last.y} r={4.5} fill={tint} />
        <Circle cx={last.x} cy={last.y} r={8} fill={tint} fillOpacity={0.22} />
      </Svg>

      {/* Axis labels are React Native text, not SVG text: they inherit the
          app's font and honour the system font-size setting, which SVG text
          does not. */}
      <View style={styles.yAxis} pointerEvents="none">
        {[...Y_TICKS].reverse().map((tick) => (
          <Text key={tick} variant="caption" tone="muted" style={styles.yLabel}>
            {tick}%
          </Text>
        ))}
      </View>

      <View style={styles.xAxis}>
        {ticks.map((index) => (
          <Text key={index} variant="caption" tone="muted">
            {labels[index]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: HEIGHT, alignItems: 'center', justifyContent: 'center' },
  yAxis: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: HEIGHT,
    // Matches the chart's own top and bottom padding so each label lines up
    // with the gridline it belongs to.
    paddingTop: 2,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  yLabel: { fontVariant: ['tabular-nums'] },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    marginTop: -spacing.xs,
  },
});
