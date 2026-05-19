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

import { useState } from "react"
import { useNavigate } from "react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { addProvider, type Provider } from "~/backend/ProviderBackend"
import { addPipe, type Pipe } from "~/backend/PipeBackend"
import { getModelProviderMetadata } from "~/lib/ProviderSetting"
import { Button } from "~/components/ui/button"
import ModelSection from "./quick-setup/ModelSection"
import PipeSection from "./quick-setup/PipeSection"
import SuccessView from "./quick-setup/SuccessView"

function randomName() {
  return Math.random().toString(36).slice(2, 8)
}

export function meta() {
  return [{ title: "Quick Setup - OpenAgent" }]
}

export default function QuickSetupPage() {
  const navigate = useNavigate()

  const [selectedModelType, setSelectedModelType] = useState<string | null>(null)
  const [providerName, setProviderName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [clientId, setClientId] = useState("")
  const [region, setRegion] = useState("us-east-1")
  const [subType, setSubType] = useState("")
  const [providerUrl, setProviderUrl] = useState("")

  const [selectedPipeType, setSelectedPipeType] = useState<string | null>(null)
  const [pipeSkipped, setPipeSkipped] = useState(false)
  const [pipeName, setPipeName] = useState("")
  const [pipeToken, setPipeToken] = useState("")

  const [saving, setSaving] = useState(false)
  const [savedProvider, setSavedProvider] = useState<Provider | null>(null)
  const [savedPipe, setSavedPipe] = useState<Pipe | null>(null)

  function handleSelectModel(type: string) {
    if (selectedModelType === type) { return }
    const meta = getModelProviderMetadata(type)
    const rand = randomName()
    setSelectedModelType(type)
    setProviderName(`provider_${rand}`)
    setApiKey("")
    setClientId("")
    setRegion("us-east-1")
    setSubType(meta.defaultSubType || "")
    setProviderUrl(meta.defaultUrl || "")
  }

  function handleSelectPipe(type: string) {
    if (selectedPipeType === type) { return }
    const rand = randomName()
    setSelectedPipeType(type)
    setPipeSkipped(false)
    setPipeName(`pipe_${rand}`)
    setPipeToken("")
  }

  function handleSkipPipe() {
    setSelectedPipeType(null)
    setPipeSkipped(true)
  }

  async function handleSave() {
    if (!selectedModelType) {
      toast.error(i18next.t("setup:Please choose an AI model"))
      return
    }
    if (!providerName.trim()) {
      toast.error(i18next.t("setup:Provider name is required"))
      return
    }
    const meta = getModelProviderMetadata(selectedModelType)
    if (meta.needsApiKey && !apiKey.trim()) {
      toast.error(i18next.t("setup:API Key is required"))
      return
    }
    if (meta.needsUrl && !providerUrl.trim()) {
      toast.error(i18next.t("setup:URL is required"))
      return
    }
    if (!subType.trim()) {
      toast.error(i18next.t("setup:Model name is required"))
      return
    }
    if (selectedPipeType && !pipeSkipped && !pipeToken.trim()) {
      toast.error(i18next.t("setup:Token is required"))
      return
    }

    setSaving(true)

    const provider: Provider = {
      owner: "admin",
      name: providerName.trim(),
      createdTime: new Date().toISOString(),
      displayName: `${selectedModelType} (${subType})`,
      displayName2: "",
      category: "Model",
      type: selectedModelType,
      subType: subType.trim(),
      clientId: meta.needsClientId ? clientId.trim() : "",
      clientSecret: apiKey.trim(),
      mcpTools: [],
      enableThinking: false,
      temperature: 1,
      topP: 1,
      topK: 4,
      frequencyPenalty: 0,
      presencePenalty: 0,
      inputPricePerThousandTokens: 0,
      outputPricePerThousandTokens: 0,
      currency: "USD",
      providerUrl: meta.needsUrl ? providerUrl.trim() : "",
      apiVersion: "",
      apiKey: "",
      network: meta.needsRegion ? region.trim() : "",
      userKey: "",
      userCert: "",
      signKey: "",
      signCert: "",
      compatibleProvider: "",
      contractName: "",
      contractMethod: "",
      state: "Active",
      isRemote: false,
    }

    try {
      const res = await addProvider(provider)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        setSaving(false)
        return
      }
      setSavedProvider(provider)

      if (selectedPipeType && !pipeSkipped && pipeToken.trim()) {
        const pipe: Pipe = {
          owner: "admin",
          name: pipeName.trim(),
          createdTime: new Date().toISOString(),
          displayName: `${selectedPipeType} Bot`,
          type: selectedPipeType,
          token: pipeToken.trim(),
          secretKey: "",
          domain: "",
          isDefault: false,
          state: "Active",
        }
        const pipeRes = await addPipe(pipe)
        if (pipeRes.status !== "ok") {
          toast.error(`${i18next.t("general:Failed to add")} pipe: ${pipeRes.msg}`)
          setSaving(false)
          return
        }
        setSavedPipe(pipe)
      }

      toast.success(i18next.t("setup:Configuration saved successfully"))
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (savedProvider) {
    return (
      <SuccessView
        savedProvider={savedProvider}
        savedPipe={savedPipe}
        onGoToChat={() => navigate("/chat")}
        onViewProvider={() => navigate(`/providers/${savedProvider.name}`)}
        onViewPipe={() => savedPipe && navigate(`/pipes/${savedPipe.name}`)}
        onReset={() => {
          setSavedProvider(null)
          setSavedPipe(null)
          setSelectedModelType(null)
          setSelectedPipeType(null)
          setPipeSkipped(false)
        }}
      />
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Quick Setup")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {i18next.t("setup:Get your AI up and running in minutes — no technical knowledge required.")}
        </p>
      </div>

      <ModelSection
        selectedModelType={selectedModelType}
        onSelectModel={handleSelectModel}
        apiKey={apiKey}
        setApiKey={setApiKey}
        clientId={clientId}
        setClientId={setClientId}
        region={region}
        setRegion={setRegion}
        subType={subType}
        setSubType={setSubType}
        providerUrl={providerUrl}
        setProviderUrl={setProviderUrl}
      />

      <PipeSection
        selectedPipeType={selectedPipeType}
        pipeSkipped={pipeSkipped}
        onSelectPipe={handleSelectPipe}
        onSkipPipe={handleSkipPipe}
        pipeToken={pipeToken}
        setPipeToken={setPipeToken}
      />

      <div className="flex justify-end pb-4">
        <Button
          size="default"
          disabled={!selectedModelType || saving}
          onClick={handleSave}
          className="min-w-[140px]"
        >
          {saving && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? i18next.t("setup:Saving...") : i18next.t("setup:Save Configuration")}
        </Button>
      </div>
    </div>
  )
}
