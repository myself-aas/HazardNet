const React = require('react');
const mkTag = (name) => (props) => React.createElement(name, props, props.children);
module.exports = {
  Svg: mkTag('svg'),
  Circle: mkTag('circle'),
  Rect: mkTag('rect'),
  Path: mkTag('path'),
  Line: mkTag('line'),
  G: mkTag('g'),
  Text: mkTag('text'),
  TSpan: mkTag('tspan'),
  Defs: mkTag('defs'),
  LinearGradient: mkTag('linearGradient'),
  Stop: mkTag('stop'),
  ClipPath: mkTag('clipPath'),
  Use: mkTag('use'),
  FlashList: (props) => {
    const { data = [], renderItem, keyExtractor = (_, i) => String(i) } = props;
    return React.createElement('div', { 'data-testid': 'flash-list' },
      data.map((item, i) => React.createElement('div', { key: keyExtractor(item, i) }, renderItem({ item, index: i, separators: {} })))
    );
  },
};
