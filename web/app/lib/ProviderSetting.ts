// Copyright 2023 The OpenAgent Authors. All Rights Reserved.
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

// @ts-nocheck
import i18next from "i18next";

export function getLanguage() {
  return i18next.language;
}

export function getProviderDisplayName(provider) {
  if (!provider) {
    return "";
  }
  const lang = getLanguage();
  const isEn = !lang || lang === "null" || lang === "en" || lang.startsWith("en-");
  if (!isEn) {
    const d2 = (provider.displayName2 || "").trim();
    if (d2) {
      return d2;
    }
  }
  const d1 = (provider.displayName || "").trim();
  if (d1) {
    return d1;
  }
  return provider.name || "";
}

export const Countries = [
  { label: "English", key: "en", country: "US", alt: "English" },
  { label: "中文", key: "zh", country: "CN", alt: "中文" },
]

export {StaticBaseUrl, getOtherProviderInfo, getProviderLogoURL} from "./ProviderLogos";
export {openaiModels, openaiEmbeddings, getCompatibleProviderOptions, getModelSubTypeOptions, getEmbeddingSubTypeOptions} from "./ProviderModels";
export {getProviderTypeOptions, getTtsFlavorOptions, getProviderSubTypeOptions, getProviderAzureApiVersionOptions} from "./ProviderOptions";
export {getQuickSetupModelTypes, getModelProviderMetadata, getPipeTypeOptions, getPipePlatformMetadata} from "./ProviderMetadata";
export {isProviderSupportWebSearch, isImageGenerationModelProvider, getToolFunctions, getThinkingModelMaxTokens} from "./ProviderUtils";
export type {ToolFunction} from "./ProviderUtils";
