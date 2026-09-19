'use client'

import { motion } from "framer-motion"
import { Plus, LucideIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "../../lib/utils"

interface SocialIcon {
  Icon: LucideIcon
  href?: string
  className?: string
  onClick?: () => void
  title?: string
}

interface AnimatedSocialIconsProps {
  icons: SocialIcon[]
  className?: string
  iconSize?: number
}

export function AnimatedSocialIcons({ 
  icons, 
  className,
  iconSize = 20
}: AnimatedSocialIconsProps) {
  const [active, setActive] = useState(false)

  // `size-11` is 44 px — the WCAG 2.5.5 target size. It was `size-10` (40 px), which
  // the responsive audit flagged on 38 routes; `sm:size-12` (48 px) was already fine.
  const buttonSize = "size-11 sm:size-12" // Reduced size a bit for dashboard

  return (
    <div className={cn("relative flex items-end justify-end", className)}>
      <div className="flex items-center justify-center relative">
        <motion.div
          className="relative bg-background rounded-full z-20"
          animate={{
            y: 0,
          }}
          transition={{ ease: "easeIn", duration: 0.5 }}
        >
          <motion.button
            className={cn(
              buttonSize,
              "rounded-full flex items-center justify-center shadow-xl",
              "bg-primary hover:bg-primary/90 transition-colors"
            )}
            onClick={() => setActive(!active)}
            animate={{ rotate: active ? 45 : 0 }}
            transition={{
              ease: "easeIn",
              duration: 0.5,
            }}
            title="Hazard Actions"
            aria-label={active ? "Close hazard actions" : "Open hazard actions"}
            aria-expanded={active}
          >
            <Plus 
              size={iconSize} 
              strokeWidth={3} 
              className="text-primary-foreground" 
            />
          </motion.button>
        </motion.div>
        
        {icons.map(({ Icon, href, className, onClick, title }, index) => {
          // Layout in a grid expanding upwards and leftwards
          const columns = 3;
          const col = index % columns;
          const row = Math.floor(index / columns) + 1;
          const targetX = -(col * 52);
          const targetY = -(row * 52);

          return (
            <motion.div
              key={index}
              className={cn(
                buttonSize,
                "absolute right-0 bottom-0 rounded-full flex items-center justify-center",
                "bg-background shadow-lg hover:shadow-xl",
                // The border lives on the control (not here): a `border-box` wrapper of
                // 44 px with a 1 px border leaves the button inside it 42 px, which is
                // 2 px short of the 44 px target the audit measures.
                "z-10",
                className
              )}
              /* The wrapper is presentational. It used to carry `title` and `onClick`
                 itself, which made a bare div the real click target wrapping a focusable
                 <a>/<button> — the `nested-interactive` violation (970 nodes) — and left
                 the inner control with no accessible name (340 `button-name` nodes).
                 Interaction and labelling now live on the control. */
              animate={{
                filter: active ? "blur(0px)" : "blur(2px)",
                scale: active ? 1 : 0.4,
                opacity: active ? 1 : 0,
                x: active ? targetX : 0,
                y: active ? targetY : 0,
              }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: active ? index * 0.02 : 0,
              }}
              // Collapsed actions are invisible; they must not swallow clicks either.
              style={{ pointerEvents: active ? "auto" : "none" }}
            >
              {/* Collapsed actions are also hidden from assistive tech and out of the tab
                  order, so the keyboard cannot land on a control the user cannot see.
                  `aria-hidden` with `tabIndex={-1}` is the combination axe accepts. */}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={title ?? "Hazard action"}
                  title={title}
                  aria-hidden={!active}
                  tabIndex={active ? 0 : -1}
                  onClick={onClick}
                  className="flex items-center justify-center w-full h-full cursor-pointer rounded-full border border-border focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <Icon
                    size={iconSize}
                    className="text-muted-foreground transition-all hover:text-foreground hover:scale-110"
                  />
                </a>
              ) : (
                <button
                  type="button"
                  aria-label={title ?? "Hazard action"}
                  title={title}
                  aria-hidden={!active}
                  tabIndex={active ? 0 : -1}
                  onClick={onClick}
                  className="flex items-center justify-center w-full h-full cursor-pointer rounded-full border border-border focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <Icon
                    size={iconSize}
                    className="text-muted-foreground transition-all hover:text-foreground hover:scale-110"
                  />
                </button>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
