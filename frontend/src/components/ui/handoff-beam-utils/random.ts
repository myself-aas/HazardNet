export function valueNoise1D(seed: number): (x: number) => number {
  return (x: number) => Math.sin(x + seed) * 0.5 + 0.5;
}
