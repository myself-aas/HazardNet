"use client"

import type React from "react"

import { useState, useRef } from "react"
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion"
import { ZoomIn, ZoomOut } from "lucide-react"

interface LocationMapProps {
  location?: string
  coordinates?: string
  className?: string
}

export function LocationMap({
  location = "San Francisco, CA",
  coordinates = "37.7749° N, 122.4194° W",
  className,
}: LocationMapProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const rotateX = useTransform(mouseY, [-50, 50], [8, -8])
  const rotateY = useTransform(mouseX, [-50, 50], [-8, 8])

  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 })
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    mouseX.set(e.clientX - centerX)
    mouseY.set(e.clientY - centerY)
  }

  const handleMouseLeave = () => {
    mouseX.set(0)
    mouseY.set(0)
    setIsHovered(false)
  }

  const handleClick = () => {
    setIsExpanded(!isExpanded)
  }

  const handleZoomToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsZoomed(!isZoomed)
  }

  return (
    <motion.div
      ref={containerRef}
      className={`relative cursor-pointer select-none ${className || ''}`}
      style={{
        perspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <motion.div
        className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          transformStyle: "preserve-3d",
        }}
        animate={{
          width: isExpanded ? 320 : 220,
          height: isExpanded ? 240 : 120,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 35,
        }}
      >
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800/80" />

              {/* Scalable inner map view */}
              <motion.div
                className="absolute inset-0 origin-center"
                animate={{
                  scale: isZoomed ? 1.55 : 1,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
              >
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                  {/* Main roads */}
                  <motion.line
                    x1="0%"
                    y1="35%"
                    x2="100%"
                    y2="35%"
                    className="stroke-slate-400/40 dark:stroke-slate-500/30"
                    strokeWidth="4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                  <motion.line
                    x1="0%"
                    y1="65%"
                    x2="100%"
                    y2="65%"
                    className="stroke-slate-400/40 dark:stroke-slate-500/30"
                    strokeWidth="4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  />

                  {/* Vertical main roads */}
                  <motion.line
                    x1="30%"
                    y1="0%"
                    x2="30%"
                    y2="100%"
                    className="stroke-slate-400/30 dark:stroke-slate-500/20"
                    strokeWidth="3"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                  />
                  <motion.line
                    x1="70%"
                    y1="0%"
                    x2="70%"
                    y2="100%"
                    className="stroke-slate-400/30 dark:stroke-slate-500/20"
                    strokeWidth="3"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                  />

                  {/* Secondary streets */}
                  {[20, 50, 80].map((y, i) => (
                    <motion.line
                      key={`h-${i}`}
                      x1="0%"
                      y1={`${y}%`}
                      x2="100%"
                      y2={`${y}%`}
                      className="stroke-slate-300/40 dark:stroke-slate-600/20"
                      strokeWidth="1.5"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
                    />
                  ))}
                  {[15, 45, 55, 85].map((x, i) => (
                    <motion.line
                      key={`v-${i}`}
                      x1={`${x}%`}
                      y1="0%"
                      x2={`${x}%`}
                      y2="100%"
                      className="stroke-slate-300/40 dark:stroke-slate-600/20"
                      strokeWidth="1.5"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.7 + i * 0.1 }}
                    />
                  ))}
                </svg>

                {/* Buildings */}
                <motion.div
                  className="absolute top-[40%] left-[10%] w-[15%] h-[20%] rounded-sm bg-slate-300/40 dark:bg-slate-700/40 border border-slate-300/30"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                />
                <motion.div
                  className="absolute top-[15%] left-[35%] w-[12%] h-[15%] rounded-sm bg-slate-300/35 dark:bg-slate-700/35 border border-slate-300/25"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                />
                <motion.div
                  className="absolute top-[70%] left-[75%] w-[18%] h-[18%] rounded-sm bg-slate-300/38 dark:bg-slate-700/38 border border-slate-300/28"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                />
                <motion.div
                  className="absolute top-[20%] right-[10%] w-[10%] h-[25%] rounded-sm bg-slate-300/32 dark:bg-slate-700/32 border border-slate-300/22"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.55 }}
                />

                <motion.div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  initial={{ scale: 0, y: -20 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.3 }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#10B981" />
                    <circle cx="12" cy="9" r="2.5" className="fill-white dark:fill-slate-900" />
                  </svg>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid pattern - only show when collapsed */}
        <motion.div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          animate={{ opacity: isExpanded ? 0 : 0.05 }}
          transition={{ duration: 0.3 }}
        >
          <svg width="100%" height="100%" className="absolute inset-0">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" className="stroke-slate-900 dark:stroke-white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </motion.div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          {/* Top section */}
          <div className="flex items-start justify-between">
            <div className="relative">
              <motion.div
                className="relative"
                animate={{
                  opacity: isExpanded ? 0 : 1,
                }}
                transition={{ duration: 0.3 }}
              >
                {/* Map Icon SVG */}
                <motion.svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-500"
                  animate={{
                    filter: isHovered
                      ? "drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))"
                      : "drop-shadow(0 0 4px rgba(16, 185, 129, 0.3))",
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                  <line x1="9" x2="9" y1="3" y2="18" />
                  <line x1="15" x2="15" y1="6" y2="21" />
                </motion.svg>
              </motion.div>
            </div>

            {/* Top controls: Zoom button & Live indicator */}
            <div className="flex items-center gap-1.5">
              {/* Zoom Button */}
              <motion.button
                type="button"
                onClick={handleZoomToggle}
                className="p-1 rounded-full bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-xs transition-colors z-20 flex items-center justify-center cursor-pointer"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                title={isZoomed ? "Zoom Out Map View" : "Zoom In Map View"}
              >
                {isZoomed ? (
                  <ZoomOut className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ZoomIn className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                )}
              </motion.button>

              {/* Status indicator */}
              <motion.div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
                animate={{
                  scale: isHovered ? 1.05 : 1,
                }}
                transition={{ duration: 0.2 }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 tracking-wide uppercase">Live</span>
              </motion.div>
            </div>
          </div>

          {/* Bottom section */}
          <div className="space-y-0.5">
            <motion.h3
              className="text-slate-900 dark:text-slate-100 font-bold text-xs tracking-tight"
              animate={{
                x: isHovered ? 3 : 0,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              {location}
            </motion.h3>

            <AnimatePresence>
              {isExpanded && (
                <motion.p
                  className="text-slate-500 dark:text-slate-400 text-[11px] font-mono"
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {coordinates}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Animated underline */}
            <motion.div
              className="h-0.5 bg-emerald-500 rounded-full"
              initial={{ scaleX: 0, originX: 0 }}
              animate={{
                scaleX: isHovered || isExpanded ? 1 : 0.3,
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

      </motion.div>

      {/* Click hint */}
      <motion.p
        className="absolute -bottom-5 left-1/2 text-[10px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap"
        style={{ x: "-50%" }}
        initial={{ opacity: 0 }}
        animate={{
          opacity: isHovered && !isExpanded ? 1 : 0,
          y: isHovered ? 0 : 4,
        }}
        transition={{ duration: 0.2 }}
      >
        Click to inspect
      </motion.p>
    </motion.div>
  )
}

export default LocationMap;
