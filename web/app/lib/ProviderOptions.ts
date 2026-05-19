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

import {getModelSubTypeOptions, getEmbeddingSubTypeOptions} from "./ProviderModels";

export function getProviderTypeOptions(category) {
  if (category === "Storage") {
    return (
      [
        {id: "Local File System", name: "Local File System"},
        {id: "Alibaba Cloud OSS", name: "Alibaba Cloud OSS"},
      ]
    );
  } else if (category === "Model") {
    return (
      [
        {id: "OpenAI", name: "OpenAI"},
        {id: "OpenAI Compatible", name: "OpenAI Compatible"},
        {id: "Gemini", name: "Gemini"},
        {id: "Hugging Face", name: "Hugging Face"},
        {id: "Claude", name: "Claude"},
        {id: "Grok", name: "Grok"},
        {id: "OpenRouter", name: "OpenRouter"},
        {id: "Baidu Cloud", name: "Baidu Cloud"},
        {id: "iFlytek", name: "iFlytek"},
        {id: "ChatGLM", name: "ChatGLM"},
        {id: "MiniMax", name: "MiniMax"},
        {id: "Ollama", name: "Ollama"},
        {id: "Local", name: "Local"},
        {id: "Azure", name: "Azure"},
        {id: "Cohere", name: "Cohere"},
        {id: "Moonshot", name: "Moonshot"},
        {id: "Amazon Bedrock", name: "Amazon Bedrock"},
        {id: "Alibaba Cloud", name: "Alibaba Cloud"},
        {id: "Baichuan", name: "Baichuan"},
        {id: "Volcano Engine", name: "Volcano Engine"},
        {id: "DeepSeek", name: "DeepSeek"},
        {id: "StepFun", name: "StepFun"},
        {id: "Tencent Cloud", name: "Tencent Cloud"},
        {id: "Yi", name: "Yi"},
        {id: "Silicon Flow", name: "Silicon Flow"},
        {id: "GitHub", name: "GitHub"},
        {id: "Writer", name: "Writer"},
      ]
    );
  } else if (category === "Embedding") {
    return (
      [
        {id: "OpenAI", name: "OpenAI"},
        {id: "Gemini", name: "Gemini"},
        {id: "Hugging Face", name: "Hugging Face"},
        {id: "Cohere", name: "Cohere"},
        {id: "Baidu Cloud", name: "Baidu Cloud"},
        {id: "Ollama", name: "Ollama"},
        {id: "Local", name: "Local"},
        {id: "Azure", name: "Azure"},
        {id: "MiniMax", name: "MiniMax"},
        {id: "Alibaba Cloud", name: "Alibaba Cloud"},
        {id: "Tencent Cloud", name: "Tencent Cloud"},
        {id: "Jina", name: "Jina"},
        {id: "Word2Vec", name: "Word2Vec"},
      ]
    );
  } else if (category === "Tool") {
    return [
      {id: "time", name: "time"},
      {id: "web_search", name: "web_search"},
      {id: "shell", name: "shell"},
      {id: "local_file", name: "local_file"},
      {id: "office", name: "office"},
      {id: "web_fetch", name: "web_fetch"},
      {id: "web_browser", name: "web_browser"},
      {id: "gui", name: "gui"},
      {id: "video_download", name: "video_download"},
      {id: "browser_use", name: "browser_use"},
    ];
  } else if (category === "Blockchain") {
    return ([
      {id: "Hyperledger Fabric", name: "Hyperledger Fabric"},
      {id: "ChainMaker", name: "ChainMaker"},
      {id: "Tencent ChainMaker", name: "Tencent ChainMaker"},
      {id: "Tencent ChainMaker (Demo Network)", name: "Tencent ChainMaker (Demo Network)"},
      {id: "Ethereum", name: "Ethereum"},
    ]);
  } else if (category === "Video") {
    return (
      [
        {id: "AWS", name: "AWS"},
        {id: "Azure", name: "Azure"},
        {id: "Alibaba Cloud", name: "Alibaba Cloud"},
      ]
    );
  } else if (category === "Text-to-Speech") {
    return [
      {id: "Alibaba Cloud", name: "Alibaba Cloud"},
    ];
  } else if (category === "Speech-to-Text") {
    return [
      {id: "Alibaba Cloud", name: "Alibaba Cloud"},
    ];
  } else if (category === "Chat") {
    return [
      {id: "Telegram", name: "Telegram"},
      {id: "Discord", name: "Discord"},
      {id: "WhatsApp", name: "WhatsApp"},
      {id: "Slack", name: "Slack"},
      {id: "Facebook Messenger", name: "Facebook Messenger"},
      {id: "Threads", name: "Threads"},
      {id: "WeChat", name: "WeChat"},
      {id: "Snapchat", name: "Snapchat"},
      {id: "X Direct Messages", name: "X Direct Messages"},
    ];
  } else {
    return [];
  }
}

export function getTtsFlavorOptions(type, subType) {
  if (type === "Alibaba Cloud" && subType === "cosyvoice-v1") {
    return [
      {id: "longwan", name: "longwan"},
      {id: "longcheng", name: "longcheng"},
      {id: "longhua", name: "longhua"},
      {id: "longxiaochun", name: "longxiaochun"},
      {id: "longxiaoxia", name: "longxiaoxia"},
      {id: "longxiaocheng", name: "longxiaocheng"},
      {id: "longxiaobai", name: "longxiaobai"},
      {id: "longlaotie", name: "longlaotie"},
      {id: "longshu", name: "longshu"},
      {id: "longjing", name: "longjing"},
      {id: "longmiao", name: "longmiao"},
      {id: "longyue", name: "longyue"},
      {id: "longyuan", name: "longyuan"},
      {id: "longfei", name: "longfei"},
      {id: "longjielidou", name: "longjielidou"},
      {id: "longshuo", name: "longshuo"},
      {id: "longtong", name: "longtong"},
      {id: "longxiang", name: "longxiang"},
      {id: "loongstella", name: "loongstella"},
      {id: "loongbella", name: "loongbella"},
    ];
  }
  return [];
}

export function getProviderSubTypeOptions(category, type) {
  if (category === "Model") {
    return getModelSubTypeOptions(type);
  } else if (category === "Embedding") {
    return getEmbeddingSubTypeOptions(type);
  } else if (category === "Tool") {
    if (type === "time") {
      return [
        {id: "Default", name: "Default"},
      ];
    } else if (type === "web_search") {
      return [
        {id: "DuckDuckGo", name: "DuckDuckGo"},
        {id: "Bing", name: "Bing"},
        {id: "Google", name: "Google"},
        {id: "Baidu", name: "Baidu"},
      ];
    } else if (type === "shell") {
      return [
        {id: "Default", name: "Default"},
      ];
    } else if (type === "local_file") {
      return [
        {id: "Default", name: "Default"},
      ];
    } else if (type === "office") {
      return [
        {id: "All", name: "All"},
        {id: "Word Read", name: "Word Read"},
        {id: "Word Write", name: "Word Write"},
        {id: "Excel Read", name: "Excel Read"},
        {id: "Excel Write", name: "Excel Write"},
        {id: "PowerPoint Read", name: "PowerPoint Read"},
        {id: "PowerPoint Write", name: "PowerPoint Write"},
      ];
    } else if (type === "web_fetch") {
      return [
        {id: "Default", name: "Default"},
      ];
    } else if (type === "web_browser") {
      return [
        {id: "Default", name: "Default"},
      ];
    } else if (type === "gui") {
      return [
        {id: "Windows UIA", name: "Windows UIA"},
      ];
    } else if (type === "video_download") {
      return [
        {id: "Default", name: "Default"},
      ];
    } else if (type === "browser_use") {
      return [
        {id: "Default", name: "Default"},
      ];
    }
    return [];
  } else if (category === "Text-to-Speech") {
    if (type === "Alibaba Cloud") {
      return [
        {id: "cosyvoice-v1", name: "cosyvoice-v1"},
      ];
    } else {
      return [];
    }
  } else if (category === "Speech-to-Text") {
    if (type === "Alibaba Cloud") {
      return [
        {id: "paraformer-realtime-v1", name: "paraformer-realtime-v1"},
      ];
    } else {
      return [];
    }
  }
  return [];
}

export function getProviderAzureApiVersionOptions() {
  return ([
    {id: "", name: ""},
    {id: "2023-03-15-preview", name: "2023-03-15-preview"},
    {id: "2023-05-15", name: "2023-05-15"},
    {id: "2023-06-01-preview", name: "2023-06-01-preview"},
    {id: "2023-07-01-preview", name: "2023-07-01-preview"},
    {id: "2023-08-01-preview", name: "2023-08-01-preview"},
  ]);
}
