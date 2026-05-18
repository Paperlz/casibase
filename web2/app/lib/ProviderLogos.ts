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

export const StaticBaseUrl = "https://cdn.openagentai.org";

export function getOtherProviderInfo() {
  const res = {
    Model: {
      "OpenAI": {
        logo: `${StaticBaseUrl}/img/social_openai.svg`,
        url: "https://platform.openai.com",
      },
      "OpenAI Compatible": {
        logo: `${StaticBaseUrl}/img/social_openai.svg`,
        url: "https://platform.openai.com",
      },
      "Gemini": {
        logo: `${StaticBaseUrl}/img/social_gemini.png`,
        url: "https://gemini.google.com/",
      },
      "Hugging Face": {
        logo: `${StaticBaseUrl}/img/social_huggingface.png`,
        url: "https://huggingface.co/",
      },
      "Claude": {
        logo: `${StaticBaseUrl}/img/social_claude.png`,
        url: "https://www.anthropic.com/claude",
      },
      "Grok": {
        logo: `${StaticBaseUrl}/img/social_xai.png`,
        url: "https://x.ai/",
      },
      "OpenRouter": {
        logo: `${StaticBaseUrl}/img/social_openrouter.png`,
        url: "https://openrouter.ai/",
      },
      "Baidu Cloud": {
        logo: `${StaticBaseUrl}/img/social_baidu_cloud.png`,
        url: "https://cloud.baidu.com/",
      },
      "iFlytek": {
        logo: `${StaticBaseUrl}/img/social_iflytek.png`,
        url: "https://www.iflytek.com/",
      },
      "ChatGLM": {
        logo: `${StaticBaseUrl}/img/social_chatglm.png`,
        url: "https://chatglm.cn/",
      },
      "MiniMax": {
        logo: `${StaticBaseUrl}/img/social_minimax.png`,
        url: "https://www.minimax.dev/",
      },
      "Ollama": {
        logo: `${StaticBaseUrl}/img/social_ollama.png`,
        url: "https://ollama.ai/",
      },
      "Local": {
        logo: `${StaticBaseUrl}/img/social_local.jpg`,
        url: "",
      },
      "Azure": {
        logo: `${StaticBaseUrl}/img/social_azure.png`,
        url: "https://azure.microsoft.com/",
      },
      "Cohere": {
        logo: `${StaticBaseUrl}/img/social_cohere.png`,
        url: "https://cohere.ai/",
      },
      "Moonshot": {
        logo: `${StaticBaseUrl}/img/social_moonshot.png`,
        url: "https://www.moonshot.cn/",
      },
      "Amazon Bedrock": {
        logo: `${StaticBaseUrl}/img/social_aws.png`,
        url: "https://aws.amazon.com/bedrock/",
      },
      "Alibaba Cloud": {
        logo: `${StaticBaseUrl}/img/social_aliyun.png`,
        url: "https://www.alibabacloud.com/",
      },
      "Baichuan": {
        logo: `${StaticBaseUrl}/img/social_baichuan-color.png`,
        url: "https://www.baichuan-ai.com/",
      },
      "Volcano Engine": {
        logo: `${StaticBaseUrl}/img/social_volc_engine.jpg`,
        url: "https://www.volcengine.com/",
      },
      "DeepSeek": {
        logo: `${StaticBaseUrl}/img/social_deepseek.png`,
        url: "https://www.deepseek.com/",
      },
      "StepFun": {
        logo: `${StaticBaseUrl}/img/social_stepfun.png`,
        url: "https://www.stepfun.com/",
      },
      "Tencent Cloud": {
        logo: `${StaticBaseUrl}/img/social_tencent_cloud.jpg`,
        url: "https://cloud.tencent.com/",
      },
      "Yi": {
        logo: `${StaticBaseUrl}/img/social_yi.png`,
        url: "https://01.ai/",
      },
      "Silicon Flow": {
        logo: `${StaticBaseUrl}/img/social_silicon_flow.png`,
        url: "https://www.siliconflow.com/",
      },
      "GitHub": {
        logo: `${StaticBaseUrl}/img/social_github.png`,
        url: "https://github.com/",
      },
      "Writer": {
        logo: `${StaticBaseUrl}/img/social_writer.png`,
        url: "https://writer.com/",
      },
    },
    Embedding: {
      "OpenAI": {
        logo: `${StaticBaseUrl}/img/social_openai.svg`,
        url: "https://platform.openai.com",
      },
      "Gemini": {
        logo: `${StaticBaseUrl}/img/social_gemini.png`,
        url: "https://gemini.google.com/",
      },
      "Hugging Face": {
        logo: `${StaticBaseUrl}/img/social_huggingface.png`,
        url: "https://huggingface.co/",
      },
      "Cohere": {
        logo: `${StaticBaseUrl}/img/social_cohere.png`,
        url: "https://cohere.ai/",
      },
      "Baidu Cloud": {
        logo: `${StaticBaseUrl}/img/social_baidu_cloud.png`,
        url: "https://cloud.baidu.com/",
      },
      "Ollama": {
        logo: `${StaticBaseUrl}/img/social_ollama.png`,
        url: "https://ollama.ai/",
      },
      "Local": {
        logo: `${StaticBaseUrl}/img/social_local.jpg`,
        url: "",
      },
      "Azure": {
        logo: `${StaticBaseUrl}/img/social_azure.png`,
        url: "https://azure.microsoft.com/",
      },
      "MiniMax": {
        logo: `${StaticBaseUrl}/img/social_minimax.png`,
        url: "https://www.minimax.dev/",
      },
      "Alibaba Cloud": {
        logo: `${StaticBaseUrl}/img/social_aliyun.png`,
        url: "https://www.alibabacloud.com/",
      },
      "Tencent Cloud": {
        logo: `${StaticBaseUrl}/img/social_tencent_cloud.jpg`,
        url: "https://cloud.tencent.com/",
      },
      "Jina": {
        logo: `${StaticBaseUrl}/img/social_jina.png`,
        url: "https://jina.ai/",
      },
      "Word2Vec": {
        logo: `${StaticBaseUrl}/img/social_local.jpg`,
        url: "",
      },
    },
    Storage: {
      "Local File System": {
        logo: `${StaticBaseUrl}/img/social_file.png`,
        url: "",
      },
      "AWS S3": {
        logo: `${StaticBaseUrl}/img/social_aws.png`,
        url: "https://aws.amazon.com/s3",
      },
      "MinIO": {
        logo: "https://min.io/resources/img/logo.svg",
        url: "https://min.io/",
      },
      "Alibaba Cloud OSS": {
        logo: `${StaticBaseUrl}/img/social_aliyun.png`,
        url: "https://aliyun.com/product/oss",
      },
      "Tencent Cloud COS": {
        logo: `${StaticBaseUrl}/img/social_tencent_cloud.jpg`,
        url: "https://cloud.tencent.com/product/cos",
      },
      "Azure Blob": {
        logo: `${StaticBaseUrl}/img/social_azure.png`,
        url: "https://azure.microsoft.com/en-us/services/storage/blobs/",
      },
      "Qiniu Cloud Kodo": {
        logo: `${StaticBaseUrl}/img/social_qiniu_cloud.png`,
        url: "https://www.qiniu.com/solutions/storage",
      },
      "Google Cloud Storage": {
        logo: `${StaticBaseUrl}/img/social_google_cloud.png`,
        url: "https://cloud.google.com/storage",
      },
      "Synology": {
        logo: `${StaticBaseUrl}/img/social_synology.png`,
        url: "https://www.synology.com/en-global/dsm/feature/file_sharing",
      },
      "Casdoor": {
        logo: `${StaticBaseUrl}/img/casdoor.png`,
        url: "https://casdoor.org/docs/provider/storage/overview",
      },
      "CUCloud OSS": {
        logo: `${StaticBaseUrl}/img/social_cucloud.png`,
        url: "https://www.cucloud.cn/product/oss.html",
      },
    },
    Blockchain: {
      "Hyperledger Fabric": {
        logo: `${StaticBaseUrl}/img/social_hyperledger.png`,
        url: "https://www.hyperledger.org/use/fabric",
      },
      "ChainMaker": {
        logo: `${StaticBaseUrl}/img/social_chainmaker.jpg`,
        url: "https://chainmaker.org.cn/",
      },
      "Tencent ChainMaker": {
        logo: `${StaticBaseUrl}/img/social_tencent_cloud.jpg`,
        url: "https://cloud.tencent.com/product/tcm",
      },
      "Tencent ChainMaker (Demo Network)": {
        logo: `${StaticBaseUrl}/img/social_tencent_cloud.jpg`,
        url: "https://cloud.tencent.com/product/tcm",
      },
      "Ethereum": {
        logo: `${StaticBaseUrl}/img/social_ethereum.png`,
        url: "https://ethereum.org/en/",
      },
    },
    Video: {
      "AWS": {
        logo: `${StaticBaseUrl}/img/social_aws.png`,
        url: "https://aws.amazon.com/",
      },
      "Azure": {
        logo: `${StaticBaseUrl}/img/social_azure.png`,
        url: "https://azure.microsoft.com/",
      },
      "Alibaba Cloud": {
        logo: `${StaticBaseUrl}/img/social_aliyun.png`,
        url: "https://www.alibabacloud.com/",
      },
    },
    Tool: {
      time: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      web_search: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      shell: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      local_file: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      office: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      web_fetch: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      web_browser: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
      gui: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32",
      },
      video_download: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/yt-dlp/yt-dlp",
      },
      browser_use: {
        logo: `${StaticBaseUrl}/img/social_mcp.png`,
        url: "https://github.com/the-open-agent/openagent",
      },
    },
    "Text-to-Speech": {
      "Alibaba Cloud": {
        logo: `${StaticBaseUrl}/img/social_aliyun.png`,
        url: "https://www.alibabacloud.com/",
      },
    },
    "Speech-to-Text": {
      "Alibaba Cloud": {
        logo: `${StaticBaseUrl}/img/social_aliyun.png`,
        url: "https://www.alibabacloud.com/",
      },
    },
    "Chat": {
      "Telegram": {
        logo: `${StaticBaseUrl}/img/social_telegram.png`,
        url: "https://telegram.org/",
      },
      "Discord": {
        logo: `${StaticBaseUrl}/img/social_discord.png`,
        url: "https://discord.com/",
      },
      "WhatsApp": {
        logo: `${StaticBaseUrl}/img/social_whatsapp.png`,
        url: "https://www.whatsapp.com/",
      },
      "Slack": {
        logo: `${StaticBaseUrl}/img/social_slack.png`,
        url: "https://slack.com/",
      },
      "Facebook Messenger": {
        logo: `${StaticBaseUrl}/img/social_messenger.png`,
        url: "https://www.messenger.com/",
      },
      "Threads": {
        logo: `${StaticBaseUrl}/img/social_threads.png`,
        url: "https://www.threads.net/",
      },
      "WeChat": {
        logo: `${StaticBaseUrl}/img/social_wechat.png`,
        url: "https://www.wechat.com/",
      },
      "Snapchat": {
        logo: `${StaticBaseUrl}/img/social_snapchat.png`,
        url: "https://kit.snapchat.com/",
      },
      "X Direct Messages": {
        logo: `${StaticBaseUrl}/img/social_x.png`,
        url: "https://developer.twitter.com/",
      },
    },
  };

  return res;
}

export function getProviderLogoURL(provider) {
  const otherProviderInfo = getOtherProviderInfo();
  if (!provider || !otherProviderInfo[provider.category] || !otherProviderInfo[provider.category][provider.type]) {
    return "";
  }

  return otherProviderInfo[provider.category][provider.type].logo;
}
