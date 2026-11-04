// Placeholder stub for the handoff-beam spring stepper.
// Replace with the real implementation from the handoff-beam package.

export interface SpringState {

  x: number;

  v: number;

}

export interface SpringConfig {

  stiffness: number;

  damping: number;

  mass: number;

}

// Minimal critically-damped spring Euler step so the file compiles.

export function stepSpring(

  s: SpringState,

  target: number,

  config: SpringConfig,

  dt: number,

): void {

  const { stiffness, damping, mass } = config;

  const a = (-stiffness * (s.x - target) - damping * s.v) / mass;

  s.v += a * dt;

  s.x += s.v * dt;

}
