// Animated number transitions (design language §1): values ease to their new
// figure instead of snapping.

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

export default function AnimatedNumber({ value, format = (v) => v, className = '' }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || prev.current === value || !Number.isFinite(value) || !Number.isFinite(prev.current)) {
      prev.current = value;
      setDisplay(value);
      return undefined;
    }
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return <span className={`tabular-nums ${className}`}>{format(display)}</span>;
}
