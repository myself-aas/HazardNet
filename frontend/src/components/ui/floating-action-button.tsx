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

  const buttonSize = "size-10 sm:size-12" // Reduced size a bit for dashboard

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
                "border border-border z-10",
                className
              )}
              title={title}
              onClick={onClick}
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
            >
              {href ? (
                <a 
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full h-full cursor-pointer"
                >
                  <Icon 
                    size={iconSize}
                    className="text-muted-foreground transition-all hover:text-foreground hover:scale-110" 
                  />
                </a>
              ) : (
                <button className="flex items-center justify-center w-full h-full cursor-pointer">
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
