import * as React from "react"
import { cn } from "../../lib/utils"

export type TripleSwitchValue = 'ALL' | 'ACC' | 'APP'

interface TripleSwitchProps {
  value: TripleSwitchValue
  onValueChange: (value: TripleSwitchValue) => void
  className?: string
}

/**
 * Three-option slider — labels centered in thumb.
 * Matches AutoPipe Data Tag slider; fixed light theme, Dashboard radii.
 */
export const TripleSwitch = React.forwardRef<HTMLDivElement, TripleSwitchProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
    const options: TripleSwitchValue[] = ['ALL', 'ACC', 'APP']
    
    // Fixed layout — stable under browser zoom (no runtime measure)
    // 40px per option (padding 0 8px)
    // Positions inside track (track padding 2px / p-0.5)
    // ALL=0, ACC=40, APP=80 (offsetLeft from track inner left)
    const TRIPLE_SWITCH_CONFIG = {
      ALL: { position: 0, width: 40 },
      ACC: { position: 40, width: 40 },
      APP: { position: 80, width: 40 }
    }
    
    // Thumb position from fixed config
    const [sliderPosition, setSliderPosition] = React.useState(TRIPLE_SWITCH_CONFIG[value].position)
    const [sliderWidth, setSliderWidth] = React.useState(TRIPLE_SWITCH_CONFIG[value].width)

    // On value change, read position/width from config (constant; omit from deps)
    React.useEffect(() => {
      const config = TRIPLE_SWITCH_CONFIG[value]
      setSliderPosition(config.position)
      setSliderWidth(config.width)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const handleOptionClick = (option: TripleSwitchValue) => {
      if (option !== value) {
        onValueChange(option)
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 rounded-lg",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "relative w-full h-7 bg-gray-200 rounded-lg",
            "border-2 border-transparent",
            "overflow-hidden",
            "flex flex-row",
            "p-0.5",
            "box-border"
          )}
          style={{
            // Stable under zoom
            imageRendering: 'crisp-edges',
            WebkitFontSmoothing: 'antialiased'
          }}
        >
          {/* Thumb background */}
          <div
            className={cn(
              "absolute top-0.5 bottom-0.5 bg-white rounded-md",
              "transition-all duration-300 ease-out",
              "z-[1] pointer-events-none"
            )}
            style={{
              // Fixed config only — thumb moves as one unit on zoom
              // left positioning avoids transform subpixel issues
              // Base left 2px (track padding) + config offset
              left: `${2 + sliderPosition}px`, // 2px track padding + offset
              width: `${sliderWidth}px`,
              // Integer pixels to avoid subpixel blur
              boxSizing: 'border-box',
              // Perf hint
              willChange: 'left, width'
            }}
          />
          
          {/* Clickable options — fixed width */}
          {options.map((option) => {
            const config = TRIPLE_SWITCH_CONFIG[option]
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleOptionClick(option)}
                className={cn(
                  "relative h-full text-center text-[11px] font-medium transition-colors duration-200",
                  "flex items-center justify-center cursor-pointer",
                  "bg-transparent border-0 p-0 outline-none focus:outline-none",
                  "z-[2] flex-shrink-0 whitespace-nowrap",
                  // Selected: dark text; others muted
                  value === option ? "text-gray-900" : "text-gray-500"
                )}
                style={{ 
                  width: `${config.width}px`, 
                  flex: `0 0 ${config.width}px`, 
                  padding: '0 8px',
                  // Stable under zoom
                  boxSizing: 'border-box',
                  minWidth: `${config.width}px`,
                  maxWidth: `${config.width}px`
                }}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
)

TripleSwitch.displayName = "TripleSwitch"
