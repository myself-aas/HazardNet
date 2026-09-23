import React from "react";
import { cn } from "@/lib/utils";

export interface HighlightProps extends React.HTMLAttributes<HTMLDivElement> {
  mode?: "parent" | "child";
  controlledItems?: boolean;
  hover?: boolean;
  containerClassName?: string;
  highlightClassName?: string;
  children?: React.ReactNode;
}

export function Highlight({
  mode,
  controlledItems,
  hover,
  containerClassName,
  highlightClassName,
  className,
  children,
  style,
  ...props
}: HighlightProps) {
  return (
    <div className={cn("relative", containerClassName)} {...props}>
      <div
        className={cn("absolute inset-0 transition-opacity pointer-events-none", className)}
        style={style}
      />
      {children}
    </div>
  );
}

export interface HighlightItemProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
  children?: React.ReactNode;
}

export function HighlightItem({ asChild, children, ...props }: HighlightItemProps) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      ...(children.props as object),
    });
  }
  return <div {...props}>{children}</div>;
}
