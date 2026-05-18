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

export function getQuickSetupModelTypes() {
  return ["OpenAI", "Claude", "Gemini", "DeepSeek", "Grok", "Ollama", "OpenRouter", "Mistral", "Azure", "OpenAI Compatible", "Alibaba Cloud", "Moonshot", "Silicon Flow", "Volcano Engine", "Baidu Cloud", "Amazon Bedrock"];
}

export function getModelProviderMetadata(type) {
  const metadata = {
    "OpenAI": {desc: "GPT-5.4, GPT-4.1, o3...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "gpt-5.4"},
    "Claude": {desc: "Claude Opus, Sonnet...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "claude-opus-4-5"},
    "Gemini": {desc: "Gemini 2.5 Pro, Flash...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "gemini-2.5-pro"},
    "DeepSeek": {desc: "DeepSeek-V4, R1...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "deepseek-v4-pro"},
    "Grok": {desc: "Grok-3, Grok-2...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "grok-3-latest"},
    "Ollama": {desc: "Run models locally", needsApiKey: false, needsUrl: true, needsClientId: false, needsRegion: false, defaultSubType: "deepseek-r1:671b", urlPlaceholder: "http://localhost:11434", defaultUrl: "http://localhost:11434"},
    "OpenRouter": {desc: "100+ models unified", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "anthropic/claude-opus-4-5"},
    "Mistral": {desc: "Mistral Large, Medium...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "mistral-large-latest"},
    "Azure": {desc: "Azure-hosted GPT models", needsApiKey: true, needsUrl: true, needsClientId: false, needsRegion: false, defaultSubType: "gpt-5.4", urlPlaceholder: "https://your-resource.openai.azure.com"},
    "OpenAI Compatible": {desc: "Any compatible API", needsApiKey: true, needsUrl: true, needsClientId: false, needsRegion: false, defaultSubType: "", urlPlaceholder: "https://api.example.com/v1"},
    "Alibaba Cloud": {desc: "Qwen3, Qwen-Max...", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "qwen3-235b-a22b"},
    "Moonshot": {desc: "Kimi K2, long-context models", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "kimi-k2-0905-preview"},
    "Silicon Flow": {desc: "DeepSeek, Qwen, and more", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "deepseek-ai/DeepSeek-R1"},
    "Volcano Engine": {desc: "ByteDance AI platform", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "doubao-seed-2-0-pro-260215"},
    "Baidu Cloud": {desc: "ERNIE Bot models", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: "ernie-5.0"},
    "Amazon Bedrock": {desc: "Claude, Llama on AWS", needsApiKey: true, needsUrl: false, needsClientId: true, needsRegion: true, defaultSubType: "claude"},
  };
  return metadata[type] || {desc: "", needsApiKey: true, needsUrl: false, needsClientId: false, needsRegion: false, defaultSubType: ""};
}

export function getPipeTypeOptions() {
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
}

export function getPipePlatformMetadata(type) {
  const metadata = {
    "Telegram": {desc: "Connect via Telegram bot", tokenLabel: "Bot Token", tokenPlaceholder: "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz", helpUrl: "https://core.telegram.org/bots#how-do-i-create-a-bot"},
    "Discord": {desc: "Connect via Discord bot", tokenLabel: "Bot Token", tokenPlaceholder: "MTxxxxxx.Gyyyyy.zzzzzzzzzzz", helpUrl: "https://discord.com/developers/applications"},
    "WhatsApp": {desc: "Connect via WhatsApp Business", tokenLabel: "Access Token", tokenPlaceholder: "EAAxxxxxxxx...", helpUrl: "https://developers.facebook.com/docs/whatsapp"},
    "Slack": {desc: "Connect via Slack bot", tokenLabel: "Bot Token", tokenPlaceholder: "xoxb-...", helpUrl: "https://api.slack.com/apps"},
    "Facebook Messenger": {desc: "Connect via Facebook Messenger", tokenLabel: "Page Access Token", tokenPlaceholder: "EAAxxxxxxxx...", helpUrl: "https://developers.facebook.com/docs/messenger-platform"},
    "Threads": {desc: "Connect via Meta Threads", tokenLabel: "User Access Token", tokenPlaceholder: "THRDSxxxxxxxx...", helpUrl: "https://developers.facebook.com/docs/threads"},
    "WeChat": {desc: "Connect via WeChat Official Account", tokenLabel: "Access Token", tokenPlaceholder: "your-access-token", helpUrl: "https://developers.weixin.qq.com"},
    "Snapchat": {desc: "Connect via Snapchat Kit Bot", tokenLabel: "Access Token", tokenPlaceholder: "your-oauth-access-token", helpUrl: "https://kit.snapchat.com/"},
    "X Direct Messages": {desc: "Connect via X Direct Messages", tokenLabel: "OAuth Token", tokenPlaceholder: "your-oauth-token", helpUrl: "https://developer.x.com"},
  };
  return metadata[type] || {desc: "", tokenLabel: "Token", tokenPlaceholder: "", helpUrl: ""};
}
