import * as React from "react"

import { cn } from "../../lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { 
    // Skip default wrapper when parent already provides a container
    noWrapper?: boolean 
  }
>(({ className, noWrapper, ...props }, ref) => {
  const table = (
    <table
      ref={ref}
      className={cn(
        // shadcn/ui base
        "w-full caption-bottom text-sm",
        // AppsFlyer layout
        "border-collapse border-spacing-0 table-auto",
        // Background and borders
        "bg-datagrid-container border-none",
        className
      )}
      {...props}
    />
  );
  
  // Existing container: no extra wrapper
  if (noWrapper) {
    return table;
  }
  
  return (
    <div className="relative w-full overflow-auto">
      {table}
    </div>
  );
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead 
    ref={ref} 
    className={cn(
      // shadcn/ui base
      "[&_tr]:border-b",
      // AppsFlyer sticky header
      "sticky top-0 z-10 bg-datagrid-pinned",
      className
    )} 
    {...props} 
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      "[&_tr:last-child]:border-0",
      className
    )}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      // shadcn/ui base
      "border-b data-[state=selected]:bg-muted",
      // AppsFlyer: no transitions (avoid selection flash)
      "transition-none",
      // Base row styles
      "min-h-[52px] bg-datagrid-container border-b border-datagrid-border",
      // Disable hover effects
      "hover:bg-datagrid-container",
      className
    )}
    style={props.style}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      // shadcn/ui base
      "h-[56px] px-4 align-middle font-medium [&:has([role=checkbox])]:pr-0",
      // AppsFlyer header cell
      "text-center font-semibold text-sm text-datagrid-text",
      "bg-datagrid-pinned border border-datagrid-border",
      "whitespace-nowrap",
      // Non-interactive header
      "select-none pointer-events-none cursor-default",
      // Avoid selection/render artifacts
      "transition-none will-change-auto backface-visible",
      // No hover
      "hover:bg-datagrid-pinned hover:border-datagrid-border",
      className
    )}
    style={props.style}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  // log-cell / actions-cell need interactive handling
  const isInteractiveCell = className?.includes('log-cell') || className?.includes('actions-cell');
  
  return (
    <td
      ref={ref}
      className={cn(
        // shadcn/ui base
        "p-4 align-middle [&:has([role=checkbox])]:pr-0",
        // AppsFlyer body cell
        "px-4 h-[52px] text-datagrid-text text-sm font-normal",
        "text-center whitespace-nowrap",
        "bg-datagrid-container border border-datagrid-border",
        // Log/Actions: no text selection; other columns allow it
        isInteractiveCell ? "select-none" : "select-text",
        // Avoid selection flash
        "transition-none will-change-auto backface-visible",
        // Allow overflow
        "overflow-visible",
        // Non-interactive cells: no pointer/hover
        !isInteractiveCell && "cursor-default hover:bg-datagrid-container hover:border-datagrid-border",
        className
      )}
      style={{
        // Log/Actions cells: higher stacking for clicks
        ...(isInteractiveCell && {
          pointerEvents: 'auto !important' as any,
          position: 'relative',
          zIndex: 1100,
          isolation: 'isolate',
          // Actions: zero padding so button fills cell
          ...(className?.includes('actions-cell') && {
            padding: '0 !important' as any
          })
        }),
        ...props.style
      } as React.CSSProperties}
      {...props}
    />
  );
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
