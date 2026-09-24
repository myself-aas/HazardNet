/**
 * Primitive layout helpers.
 */

import React from 'react';
import {
  View,
  ViewProps,
  ViewStyle,
  StyleSheet,
  StyleProp,
  FlexAlignType,
  DimensionValue,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface BoxProps extends ViewProps {
  p?: number;
  px?: number;
  py?: number;
  pt?: number;
  pb?: number;
  pl?: number;
  pr?: number;
  m?: number;
  mx?: number;
  my?: number;
  mt?: number;
  mb?: number;
  bg?: string;
  radius?: number;
  bw?: number;
  bc?: string;
  flex?: number;
  w?: DimensionValue;
  h?: DimensionValue;
  align?: FlexAlignType;
  justify?: ViewStyle['justifyContent'];
  overflow?: ViewStyle['overflow'];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

function resolveColor(token: string | undefined, colors: Record<string, string>): string | undefined {
  if (!token) return undefined;
  return colors[token] ?? token;
}

export const Box = React.forwardRef<View, BoxProps>(function Box(
  {
    p, px, py, pt, pb, pl, pr,
    m, mx, my, mt, mb,
    bg, radius, bw, bc,
    flex, w, h, align, justify, overflow,
    style, children, ...rest
  },
  ref,
) {
  const { theme } = useTheme();
  const resolved: ViewStyle = {
    padding: p,
    paddingHorizontal: px,
    paddingVertical: py,
    paddingTop: pt,
    paddingBottom: pb,
    paddingLeft: pl,
    paddingRight: pr,
    margin: m,
    marginHorizontal: mx,
    marginVertical: my,
    marginTop: mt,
    marginBottom: mb,
    backgroundColor: resolveColor(bg, theme.colors),
    borderRadius: radius,
    borderWidth: bw,
    borderColor: resolveColor(bc, theme.colors),
    flex,
    width: w,
    height: h,
    alignItems: align,
    justifyContent: justify,
    overflow,
  };
  return (
    <View ref={ref} style={[resolved, style]} {...rest}>
      {children}
    </View>
  );
});

export interface StackProps extends Omit<BoxProps, 'flex'> {
  space?: number;
  reverse?: boolean;
  align?: FlexAlignType;
  justify?: ViewStyle['justifyContent'];
  flex?: number;
}

function intersperse(children: React.ReactNode, space: number, axis: 'x' | 'y', reverse: boolean): React.ReactNode[] {
  const arr = React.Children.toArray(children).filter(Boolean);
  if (!space || arr.length <= 1) return arr;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (reverse ? i < arr.length - 1 : i > 0) {
      const spacer =
        axis === 'x'
          ? <View key={`s-${i}`} style={{ width: space }} />
          : <View key={`s-${i}`} style={{ height: space }} />;
      out.push(spacer);
    }
    out.push(arr[i]);
  }
  return out;
}

export const VStack: React.FC<StackProps> = ({
  space = 0,
  reverse = false,
  align = 'stretch',
  justify,
  flex,
  children,
  style,
  ...rest
}) => (
  <Box
    flex={flex}
    align={align}
    justify={justify}
    style={[{ flexDirection: reverse ? 'column-reverse' : 'column' }, style as ViewStyle]}
    {...rest}
  >
    {intersperse(children, space, 'y', reverse)}
  </Box>
);

export const HStack: React.FC<StackProps> = ({
  space = 0,
  reverse = false,
  align = 'center',
  justify,
  flex,
  children,
  style,
  ...rest
}) => (
  <Box
    flex={flex}
    align={align}
    justify={justify}
    style={[{ flexDirection: reverse ? 'row-reverse' : 'row' }, style as ViewStyle]}
    {...rest}
  >
    {intersperse(children, space, 'x', reverse)}
  </Box>
);

export const Spacer: React.FC<{ flex?: number }> = ({ flex = 1 }) => <Box flex={flex} />;

export const Divider: React.FC<{ my?: number; color?: string }> = ({ my = 0, color }) => {
  const { theme } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: color ?? theme.colors.hairline,
        marginVertical: my,
      }}
    />
  );
};
