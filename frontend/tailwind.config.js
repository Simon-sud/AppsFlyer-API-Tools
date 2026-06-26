/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // AppsFlyer DataGrid colors
        datagrid: {
          container: "#FFFFFF",
          pinned: "#FFFFFF",
          border: "#E6E9F0",
          text: "rgb(34, 13, 78)",
          overlay: "rgba(249, 250, 252, 0.38)",
        },
      },
      fontSize: {
        'datagrid': ['14px', { lineHeight: '20px', letterSpacing: '0.0025em' }],
      },
      spacing: {
        'datagrid-header': '56px',
        'datagrid-row': '52px',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "highlight-success": {
          "0%": {
            backgroundColor: "#f6ffed",
            boxShadow: "0 0 0 2px rgba(82, 196, 26, 0.3)",
          },
          "100%": {
            backgroundColor: "#f6ffed",
            boxShadow: "0 0 0 2px rgba(82, 196, 26, 0.2)",
          },
        },
        "highlight-processing": {
          "0%": {
            backgroundColor: "#e6f7ff",
            boxShadow: "0 0 0 2px rgba(22, 119, 255, 0.3)",
          },
          "100%": {
            backgroundColor: "#e6f7ff",
            boxShadow: "0 0 0 2px rgba(22, 119, 255, 0.2)",
          },
        },
        "highlight-failed": {
          "0%": {
            backgroundColor: "#fff2e8",
            boxShadow: "0 0 0 2px rgba(250, 140, 22, 0.3)",
          },
          "100%": {
            backgroundColor: "#fff2e8",
            boxShadow: "0 0 0 2px rgba(250, 140, 22, 0.2)",
          },
        },
        "highlight-error": {
          "0%": {
            backgroundColor: "#fff1f0",
            boxShadow: "0 0 0 2px rgba(255, 77, 79, 0.3)",
          },
          "100%": {
            backgroundColor: "#fff1f0",
            boxShadow: "0 0 0 2px rgba(255, 77, 79, 0.2)",
          },
        },
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      transitionTimingFunction: {
        // 明确命名，避免 arbitrary value ease-[cubic-bezier(.4,1.2,.6,1)] 的歧义警告
        "smooth-in-out": "cubic-bezier(.4, 1.2, .6, 1)",
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "highlight-success": "highlight-success 2s ease-in-out",
        "highlight-processing": "highlight-processing 2s ease-in-out",
        "highlight-failed": "highlight-failed 2s ease-in-out",
        "highlight-error": "highlight-error 2s ease-in-out",
        "skeleton-shimmer": "skeleton-shimmer 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
}

