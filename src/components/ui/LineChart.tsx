import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line as SvgLine } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import {
  areaPath,
  labelIndices,
  niceDomain,
  plot,
  smoothPath,
  ticksFor,
  yFor,
  type PlotBox,
} from '@/lib/chart';
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
  tint: string;
  accessibilityLabel: string;
}

export function LineChart({ values, labels, tint, accessibilityLabel }: LineChartProps) {
  // Measured rather than assumed. A fixed viewBox has to be fitted to the real
  // width somehow, and both ways out are wrong: the default letterboxes it, so
  // the drawing ends up shorter than the box the axis labels are laid out
  // against and every label drifts off its gridline; `preserveAspectRatio` set
  // to none stretches x instead, which turns the endpoint dot into an ellipse.
  // A viewBox in real pixels is 1:1, so neither happens.
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  const box: PlotBox = {
    width,
    height: HEIGHT,
    padLeft: 34,
    padRight: 8,
    padTop: 10,
    padBottom: 22,
  };

  // Fitted to the data rather than pinned to 0–100: a rate that lives between
  // 70 and 95 has nothing to say when three quarters of the chart is empty.
  const domain = niceDomain(values);
  const ticks = ticksFor(domain);
  const points = plot(values, box, domain);
  const baseline = yFor(domain.min, box, domain);
  const last = points.at(-1);
  const labelAt = labelIndices(labels.length, 4);

  if (points.length === 0) {
    return (
      <View style={styles.empty} onLayout={onLayout}>
        <Text tone="muted">Not enough history yet.</Text>
      </View>
    );
  }

  // Nothing to draw until the first layout pass reports a width.
  if (width === 0) return <View style={styles.empty} onLayout={onLayout} />;

  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel} onLayout={onLayout}>
      <Svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <Defs>
          <LinearGradient id="under" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={0.35} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {ticks.map((tick) => (
          <SvgLine
            key={tick}
            x1={box.padLeft}
            x2={box.width - box.padRight}
            y1={yFor(tick, box, domain)}
            y2={yFor(tick, box, domain)}
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
        {last && (
          <>
            <Circle cx={last.x} cy={last.y} r={4.5} fill={tint} />
            <Circle cx={last.x} cy={last.y} r={8} fill={tint} fillOpacity={0.22} />
          </>
        )}
      </Svg>

      {/* Axis labels are React Native text, not SVG text: they inherit the
          app's font and honour the system font-size setting, which SVG text
          does not. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {ticks.map((tick) => (
          <Text
            key={tick}
            variant="caption"
            tone="muted"
            style={[styles.yLabel, { top: yFor(tick, box, domain) - 8 }]}
          >
            {tick}%
          </Text>
        ))}
      </View>

      <View style={styles.xAxis}>
        {labelAt.map((index) => (
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
  // Each label is placed at its own gridline's y, rather than spaced evenly
  // down a fixed-height column. The old way assumed five labels always fit in
  // 190dp; at a large system font size they overflowed and collapsed into each
  // other, which is exactly the setting the app is not allowed to break.
  yLabel: {
    position: 'absolute',
    left: 0,
    fontVariant: ['tabular-nums'],
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    marginTop: -spacing.xs,
  },
});
