"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const THEME_CHANGE_EVENT = "zehri:crm-theme-change"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme: nextTheme = "system" } = useTheme()
  const [crmTheme, setCrmTheme] = React.useState<"light" | "dark" | null>(null)

  React.useEffect(() => {
    function readCrmTheme() {
      const val = document.documentElement.dataset.crmTheme
      if (val === "light" || val === "dark") {
        setCrmTheme(val)
      } else {
        setCrmTheme(null)
      }
    }

    readCrmTheme()

    function handleThemeChange(event: Event) {
      const customEvent = event as CustomEvent<{ theme: "light" | "dark" | null }>
      if (customEvent.detail && (customEvent.detail.theme === "light" || customEvent.detail.theme === "dark")) {
        setCrmTheme(customEvent.detail.theme)
      } else {
        readCrmTheme()
      }
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    document.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

    const observer = new MutationObserver(() => {
      readCrmTheme()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-crm-theme"],
    })

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      document.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      observer.disconnect()
    }
  }, [])

  const effectiveTheme = crmTheme ?? (nextTheme as ToasterProps["theme"])

  return (
    <Sonner
      theme={effectiveTheme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
