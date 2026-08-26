'use client';
import { useLayoutEffect, useRef } from 'react';
import {
  MotionValue,
  motion,
  useSpring,
  useTransform,
  useMotionValue,
} from 'motion/react';

const TRANSITION = {
  type: 'spring' as const,
  // ~2× slower than Motion Primitives defaults (period ∝ 1/√k)
  stiffness: 70,
  damping: 9,
  mass: 0.3,
};

function Digit({ value, place }: { value: number; place: number }) {
  const valueRoundedToPlace = Math.floor(value / place) % 10;
  const source = useMotionValue(valueRoundedToPlace);
  const animatedValue = useSpring(source, TRANSITION);
  const prevDigitRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const prev = prevDigitRef.current;
    if (prev === null) {
      source.jump(valueRoundedToPlace);
      prevDigitRef.current = valueRoundedToPlace;
      return;
    }
    if (prev === valueRoundedToPlace) return;
    source.set(valueRoundedToPlace);
    prevDigitRef.current = valueRoundedToPlace;
  }, [source, valueRoundedToPlace]);

  // span-only tree so this can live inside phrasing content without browser DOM repair.
  return (
    <span className='relative inline-block h-[1em] w-[1ch] overflow-x-visible overflow-y-clip leading-none tabular-nums'>
      <span className='invisible'>0</span>
      {Array.from({ length: 10 }, (_, i) => (
        <Number key={i} mv={animatedValue} number={i} />
      ))}
    </span>
  );
}

function Number({ mv, number }: { mv: MotionValue<number>; number: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset;
    if (offset > 5) {
      memo -= 10;
    }
    return `${memo}em`;
  });

  return (
    <motion.span
      style={{ y }}
      className='absolute inset-0 flex items-center justify-center'
      transition={TRANSITION}
    >
      {number}
    </motion.span>
  );
}

type SlidingNumberProps = {
  value: number;
  padStart?: boolean;
  decimalSeparator?: string;
};

export function SlidingNumber({
  value,
  padStart = false,
  decimalSeparator = '.',
}: SlidingNumberProps) {
  const absValue = Math.abs(value);
  const [integerPart, decimalPart] = absValue.toString().split('.');
  const integerValue = parseInt(integerPart, 10);
  const paddedInteger =
    padStart && integerValue < 10 ? `0${integerPart}` : integerPart;
  const integerDigits = paddedInteger.split('');
  const integerPlaces = integerDigits.map((_, i) =>
    Math.pow(10, integerDigits.length - i - 1)
  );

  return (
    <span className='inline-flex items-center leading-none'>
      {value < 0 && '-'}
      {integerDigits.map((_, index) => (
        <Digit
          key={`pos-${integerPlaces[index]}`}
          value={integerValue}
          place={integerPlaces[index]}
        />
      ))}
      {decimalPart && (
        <>
          <span>{decimalSeparator}</span>
          {decimalPart.split('').map((_, index) => (
            <Digit
              key={`decimal-${index}`}
              value={parseInt(decimalPart, 10)}
              place={Math.pow(10, decimalPart.length - index - 1)}
            />
          ))}
        </>
      )}
    </span>
  );
}
