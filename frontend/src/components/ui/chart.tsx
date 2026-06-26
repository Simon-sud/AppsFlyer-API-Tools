"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "../../lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: { light: string; dark: string } }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [hasSize, setHasSize] = React.useState(false)
  const [dimensions, setDimensions] = React.useState<{ width: number; height: number } | null>(null)
  const mountedRef = React.useRef(false)

  // Merge refs
  React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)

  // useLayoutEffect: measure size right after DOM update
  React.useLayoutEffect(() => {
    mountedRef.current = true
    const element = containerRef.current
    if (!element) {
      // Missing element: retry once
      const retryTimeout = setTimeout(() => {
        if (mountedRef.current && containerRef.current) {
          // Single retry
          const checkSize = () => {
            const el = containerRef.current
            if (!el || !mountedRef.current) return
            const rect = el.getBoundingClientRect()
            const { width, height } = rect
            const isValid = width >= 200 && height >= 200
            if (isValid) {
              setDimensions({ width, height })
              setHasSize(true)
            }
          }
          checkSize()
        }
      }, 100)
      return () => clearTimeout(retryTimeout)
    }

    const checkSize = () => {
      if (!element || !mountedRef.current) return
      const rect = element.getBoundingClientRect()
      const { width, height } = rect
      // Container must be at least 200px
      const isValid = width >= 200 && height >= 200
      
      if (isValid) {
        // Floor at 200px minimum
        const newDimensions = { 
          width: Math.max(200, Math.floor(width)), 
          height: Math.max(200, Math.floor(height)) 
        }
        setDimensions(prev => {
          // Update only on meaningful size change
          if (!prev || Math.abs(prev.width - newDimensions.width) > 1 || Math.abs(prev.height - newDimensions.height) > 1) {
            return newDimensions
          }
          return prev
        })
        setHasSize(true)
      } else {
        setHasSize(false)
      }
    }

    // Initial measure
    checkSize()

    const resizeObserver = new ResizeObserver(() => {
      // Double rAF after layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (mountedRef.current) {
            checkSize()
          }
        })
      })
    })

    // Start observing
    resizeObserver.observe(element)
    
    // Staggered remeasures for edge cases
    const timeouts = [
      setTimeout(() => { if (mountedRef.current) checkSize() }, 0),
      setTimeout(() => { if (mountedRef.current) checkSize() }, 10),
      setTimeout(() => { if (mountedRef.current) checkSize() }, 50),
      setTimeout(() => { if (mountedRef.current) checkSize() }, 100),
      setTimeout(() => { if (mountedRef.current) checkSize() }, 200),
      setTimeout(() => { if (mountedRef.current) checkSize() }, 500),
    ]

    return () => {
      mountedRef.current = false
      resizeObserver.disconnect()
      timeouts.forEach(clearTimeout)
    }
  }, []) // Run once on mount

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={containerRef}
        className={cn(
          "flex justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line-line]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        style={{
          width: '100%',
          height: '100%',
          minWidth: 200,
          minHeight: 200,
          position: 'relative',
          ...props.style,
        }}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {/* Wrapper gives ResponsiveContainer explicit size */}
        <div 
          style={{ 
            width: '100%', 
            height: '100%',
            minWidth: 200,
            minHeight: 200,
            position: 'relative',
            display: hasSize && dimensions ? 'block' : 'none',
          }}
        >
          {hasSize && dimensions && dimensions.width >= 200 && dimensions.height >= 200 ? (
            <RechartsPrimitive.ResponsiveContainer 
              key={`chart-${dimensions.width}-${dimensions.height}`}
              width={dimensions.width}
              height={dimensions.height}
              minWidth={200}
              minHeight={200}
            >
              {children}
            </RechartsPrimitive.ResponsiveContainer>
          ) : null}
        </div>
        {/* Placeholder until container has size */}
        {!hasSize || !dimensions || dimensions.width < 200 || dimensions.height < 200 ? (
          <div 
            style={{ 
              width: '100%', 
              height: '100%', 
              minWidth: 200, 
              minHeight: 200,
              visibility: 'hidden',
              pointerEvents: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
            }} 
            aria-hidden="true"
          />
        ) : null}
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = config[key as keyof typeof config]
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-md",
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = config[key as keyof typeof config]
            const indicatorColor = color || item.payload.fill || item.color

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-2 border-2 border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { payload, verticalAlign = "bottom", hideIcon = false, nameKey, className },
    ref
  ) => {
    const { config } = useChart()

    if (!payload?.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className
        )}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`
          const itemConfig = config[key as keyof typeof config]

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegendContent"

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}

