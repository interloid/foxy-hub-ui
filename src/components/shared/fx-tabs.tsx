'use client'

import * as React from 'react'

import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

function FxTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      data-slot="fx-tabs-list"
      className={cn(
        'border-border gap-0.5 rounded-md border p-0.5 group-data-horizontal/tabs:h-8',
        className
      )}
      {...props}
    />
  )
}

function FxTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      data-slot="fx-tabs-trigger"
      className={cn(
        'text-muted-foreground data-active:bg-primary dark:data-active:bg-primary h-full rounded-sm px-2.75 py-0 text-xs font-semibold data-active:text-white group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:text-white',
        className
      )}
      {...props}
    />
  )
}

function FxTabsListUnderline({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      data-slot="fx-tabs-list-underline"
      variant="line"
      className={cn(
        'border-border w-full justify-start gap-1 rounded-none border-b p-0 group-data-horizontal/tabs:h-auto',
        className
      )}
      {...props}
    />
  )
}

function FxTabsTriggerUnderline({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      data-slot="fx-tabs-trigger-underline"
      className={cn(
        'text-subtle-foreground after:bg-primary dark:text-subtle-foreground data-active:text-foreground dark:data-active:text-foreground h-10 flex-none gap-1.75 px-3.5 py-0 text-base font-semibold after:rounded-full group-data-horizontal/tabs:after:-bottom-px',
        'origin-bottom transition-transform duration-200 data-active:scale-105', // Scale effect on active tab
        className
      )}
      {...props}
    />
  )
}

export {
  FxTabsList,
  FxTabsListUnderline,
  FxTabsTrigger,
  FxTabsTriggerUnderline,
}
