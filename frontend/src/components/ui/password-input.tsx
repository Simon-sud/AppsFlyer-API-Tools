import * as React from "react"
import { Input } from "./input"
import { cn } from "../../lib/utils"
import { FiEye, FiEyeOff } from "react-icons/fi"

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  showPassword?: boolean
  onTogglePassword?: () => void
  error?: string
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showPassword = false, onTogglePassword, error, style, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type="text"
          className={cn(
            "pr-10", // Space for toggle button
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          style={{
            ...style,
            // Toggle visibility via CSS
            WebkitTextSecurity: showPassword ? 'none' : 'disc',
            textSecurity: showPassword ? 'none' : 'disc',
          }}
          {...props}
        />
        {onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent"
            tabIndex={-1}
          >
            {showPassword ? (
              <FiEye className="h-4 w-4" />
            ) : (
              <FiEyeOff className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }

