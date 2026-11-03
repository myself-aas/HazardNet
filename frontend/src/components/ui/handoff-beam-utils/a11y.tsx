// Placeholder stub for the handoff-beam a11y live region.
// Replace with the real implementation from the handoff-beam package.

import * as React from "react";

export function LiveRegion({

  children,

}: {

  children?: React.ReactNode;

}) {

  return <span aria-live="polite" className="sr-only">{children}</span>;

}
