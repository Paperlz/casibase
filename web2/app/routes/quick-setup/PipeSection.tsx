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

import { ExternalLinkIcon, MinusCircleIcon } from "lucide-react"
import i18next from "i18next"
import {
  getPipePlatformMetadata,
  getPipeTypeOptions,
  getProviderLogoURL,
} from "~/lib/ProviderSetting"
import { Input } from "~/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { cn } from "~/lib/utils"
import { FieldRow, SectionTitle, SelectableCard } from "./QuickSetupCommon"

interface PipeSectionProps {
  selectedPipeType: string | null
  pipeSkipped: boolean
  onSelectPipe: (type: string) => void
  onSkipPipe: () => void
  pipeToken: string
  setPipeToken: (v: string) => void
}

export default function PipeSection({
  selectedPipeType,
  pipeSkipped,
  onSelectPipe,
  onSkipPipe,
  pipeToken,
  setPipeToken,
}: PipeSectionProps) {
  const pipeTypes = getPipeTypeOptions()
  const meta = selectedPipeType ? getPipePlatformMetadata(selectedPipeType) : null

  return (
    <Card>
      <CardHeader className="border-b">
        <SectionTitle
          number={2}
          title={i18next.t("setup:Connect a Messaging Platform")}
          subtitle={i18next.t("setup:Optional")}
        />
        <CardDescription>
          {i18next.t("setup:Connect a messaging app so users can chat with your AI through Telegram, Discord, or WhatsApp. You can skip this step and set it up later.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
        >
          {pipeTypes.map((p: { id: string; name: string }) => (
            <SelectableCard
              key={p.id}
              logo={getProviderLogoURL({ category: "Chat", type: p.id })}
              label={p.name}
              desc={getPipePlatformMetadata(p.id).desc}
              selected={selectedPipeType === p.id}
              onClick={() => onSelectPipe(p.id)}
            />
          ))}

          <Card
            onClick={onSkipPipe}
            className={cn(
              "cursor-pointer select-none transition-all",
              pipeSkipped
                ? "ring-2 ring-muted-foreground/40 bg-muted/50"
                : "hover:ring-muted-foreground/30 hover:bg-accent/40"
            )}
          >
            <CardContent className="flex flex-col items-center text-center py-2 px-1.5">
              <div className="flex h-8 w-8 items-center justify-center mb-1.5">
                <MinusCircleIcon className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="text-[11px] font-semibold leading-tight mb-0.5">{i18next.t("setup:Skip")}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{i18next.t("setup:Set up later")}</div>
            </CardContent>
          </Card>
        </div>

        {meta && !pipeSkipped && (
          <>
            <Separator className="my-5" />
            <p className="text-sm font-medium mb-4 text-foreground">
              {i18next.t("setup:Configure")} {selectedPipeType}
            </p>

            <FieldRow
              label={meta.tokenLabel}
              hint={
                <span>
                  {i18next.t("setup:How to get a token?")}&nbsp;
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {i18next.t("setup:View guide")}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                </span>
              }
            >
              <Input
                type="password"
                value={pipeToken}
                onChange={(e) => setPipeToken(e.target.value)}
                placeholder={meta.tokenPlaceholder}
              />
            </FieldRow>
          </>
        )}
      </CardContent>
    </Card>
  )
}
