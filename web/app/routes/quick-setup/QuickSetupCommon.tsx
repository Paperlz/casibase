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

import { CheckIcon } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent, CardTitle } from "~/components/ui/card"
import { Label } from "~/components/ui/label"
import { cn } from "~/lib/utils"

interface SelectableCardProps {
  logo?: string
  label: string
  desc: string
  selected: boolean
  onClick: () => void
  icon?: React.ReactNode
}

export function SelectableCard({ logo, label, desc, selected, onClick, icon }: SelectableCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative cursor-pointer select-none transition-all",
        selected
          ? "ring-2 ring-primary bg-primary/5"
          : "hover:ring-primary/40 hover:bg-accent/40"
      )}
    >
      {selected && (
        <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
          <CheckIcon className="h-2.5 w-2.5 text-primary-foreground" />
        </span>
      )}
      <CardContent className="flex flex-col items-center text-center py-2 px-1.5">
        <div className="flex h-8 w-8 items-center justify-center mb-1.5">
          {icon ?? (logo ? (
            <img src={logo} alt={label} className="max-w-[32px] max-h-[32px] object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground">
              {label[0]}
            </div>
          ))}
        </div>
        <div className="text-[11px] font-semibold leading-tight mb-0.5 truncate w-full">{label}</div>
        <div className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{desc}</div>
      </CardContent>
    </Card>
  )
}

interface SectionTitleProps {
  number: number
  title: string
  subtitle?: string
}

export function SectionTitle({ number, title, subtitle }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {number}
      </span>
      <CardTitle className="text-base">{title}</CardTitle>
      {subtitle && (
        <Badge variant="secondary" className="font-normal text-xs">
          {subtitle}
        </Badge>
      )}
    </div>
  )
}

interface FieldRowProps {
  label: string
  children: React.ReactNode
  hint?: React.ReactNode
}

export function FieldRow({ label, children, hint }: FieldRowProps) {
  return (
    <div className="space-y-1.5 mb-4">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
