"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Triggers subtle vibration feedback on supported mobile devices.
 * Uses a crisp 12ms pulse by default for a natural, tactile click response.
 */
export const triggerHapticFeedback = (pattern: number | number[] = 12) => {
  try {
    if (typeof window !== "undefined" && "navigator" in window && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Safely ignore if unsupported or blocked by browser security policy
  }
};

export type TabItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  color: string;
  onClick?: () => void;
};

export type ExpandableTabsProps = {
  tabs: TabItem[];
  defaultTabId?: string;
  activeTabId?: string;
  onChange?: (id: string) => void;
  enableHaptics?: boolean;
  className?: string;
};

export const ExpandableTabs = ({
  tabs,
  defaultTabId = tabs[0]?.id,
  activeTabId: controlledActiveTabId,
  onChange,
  enableHaptics = true,
  className,
}: ExpandableTabsProps) => {
  const [internalActiveTabId, setInternalActiveTabId] = useState(defaultTabId);
  const activeTabId = controlledActiveTabId !== undefined ? controlledActiveTabId : internalActiveTabId;

  const handleTabClick = (tab: TabItem) => {
    if (enableHaptics) {
      triggerHapticFeedback(14);
    }
    if (controlledActiveTabId === undefined) {
      setInternalActiveTabId(tab.id);
    }
    onChange?.(tab.id);
    tab.onClick?.();
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-2xl bg-white dark:bg-secondary text-secondary-foreground shadow-sm",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const Icon = tab.icon;

        return (
          <motion.div
            key={tab.id}
            layout
            className={cn(
              "flex items-center justify-center rounded-xl cursor-pointer overflow-hidden h-[46px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 select-none active:scale-95",
              tab.color,
              isActive ? "flex-1 shadow-sm" : "flex-none opacity-85 hover:opacity-100",
            )}
            onClick={() => handleTabClick(tab)}
            initial={false}
            animate={{
              width: isActive ? 128 : 46,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
          >
            <motion.div
              className="flex items-center justify-center h-[46px] px-2.5"
              initial={{ filter: "blur(10px)" }}
              animate={{ filter: "blur(0px)" }}
              exit={{ filter: "blur(10px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <Icon className="flex-shrink-0 w-5 h-5 text-white aspect-square" />
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.span
                    className="ml-2 text-white font-bold text-xs tracking-tight whitespace-nowrap"
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0.8 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    style={{ originX: 0 }}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default ExpandableTabs;
