// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useEffect, useRef, useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  HelpCircleIcon,
  LinkIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { ServerUrl, getAcceptLanguage } from "~/lib/api"

// ── FormField ─────────────────────────────────────────────────────────────────

export function FormField({
  label,
  tooltip,
  children,
  className = "",
}: {
  label: string
  tooltip?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-1">
        <Label className="select-text cursor-text text-sm font-medium text-muted-foreground">
          {label}
        </Label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground">
              <HelpCircleIcon className="h-3.5 w-3.5 shrink-0" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="border-b pb-4">
        <CardTitle>{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}

// ── PasswordInput ─────────────────────────────────────────────────────────────

export function PasswordInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9"
      />
      <button
        type="button"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── NumberInput ───────────────────────────────────────────────────────────────

export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number | undefined
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <Input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

// ── TagInput ──────────────────────────────────────────────────────────────────

export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  suggestions?: string[]
}) {
  const [inputVal, setInputVal] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function add(v: string) {
    const trimmed = v.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInputVal("")
    setOpen(false)
  }

  function remove(v: string) {
    onChange(value.filter((x) => x !== v))
  }

  const filtered = (suggestions ?? []).filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(inputVal.toLowerCase())
  )

  return (
    <div ref={ref} className="relative">
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex h-5 items-center gap-1 rounded bg-muted px-1.5 text-xs font-medium"
          >
            {v}
            <button
              type="button"
              className="opacity-60 hover:opacity-100"
              onClick={() => remove(v)}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-16 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          value={inputVal}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => {
            setInputVal(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add(inputVal)
            }
            if (e.key === "Backspace" && !inputVal && value.length > 0) {
              remove(value[value.length - 1])
            }
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => add(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MultiSelect ───────────────────────────────────────────────────────────────

export function MultiSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string[]
  options: Array<{ label: string; value: string }>
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v))
    } else {
      onChange([...value, v])
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => setOpen((o) => !o)}
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          value.map((v) => {
            const opt = options.find((o) => o.value === v)
            return (
              <span
                key={v}
                className="inline-flex h-5 items-center gap-1 rounded bg-muted px-1.5 text-xs font-medium"
              >
                {opt?.label ?? v}
                <button
                  type="button"
                  className="ml-0.5 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(v)
                  }}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            )
          })
        )}
        <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => toggle(opt.value)}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {value.includes(opt.value) && <CheckIcon className="h-3.5 w-3.5" />}
              </span>
              {opt.label}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {i18next.t("general:No data")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ImageUploadField ──────────────────────────────────────────────────────────

export function ImageUploadField({
  label,
  tooltip,
  value,
  onChange,
  siteName,
  uploading,
  onUploading,
}: {
  label: string
  tooltip?: string
  value: string
  onChange: (url: string) => void
  siteName: string
  uploading: boolean
  onUploading: (v: boolean) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    onUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    fetch(
      `${ServerUrl}/api/upload-resource?owner=admin&tag=avatar&parent=site&object=${encodeURIComponent(siteName)}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Accept-Language": getAcceptLanguage() },
        body: formData,
      }
    )
      .then((res) => res.json())
      .then((res) => {
        if (res.status === "ok") {
          onChange(res.data)
          toast.success(i18next.t("general:Successfully uploaded"))
        } else {
          toast.error(`${i18next.t("general:Failed to upload")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => onUploading(false))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Label className="select-text cursor-text text-sm font-medium text-muted-foreground">
          {label}
        </Label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground">
              <HelpCircleIcon className="h-3.5 w-3.5 shrink-0" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <UploadIcon className="h-4 w-4" />
          )}
          {i18next.t("general:Upload")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ""
          }}
        />
      </div>
      {value && (
        <img
          src={value}
          alt=""
          className="mt-1 h-20 w-auto rounded border border-border object-contain"
        />
      )}
    </div>
  )
}
