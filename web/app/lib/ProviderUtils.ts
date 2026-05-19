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

export function isProviderSupportWebSearch(provider) {
  if (!provider || provider.category !== "Model") {
    return false;
  }

  if (provider.type === "OpenAI") {
    return true;
  }

  if (provider.type === "Alibaba Cloud") {
    // Wanxiang image generation models do not support web search
    if (provider.subType && provider.subType.startsWith("wanx")) {
      return false;
    }

    if (!provider.subType) {
      return true; // Default to true for Alibaba Cloud if subType is not specified
    }

    return true;
  }

  return false;
}

export function isImageGenerationModelProvider(provider) {
  if (!provider || provider.category !== "Model") {
    return false;
  }
  const subType = (provider.subType || "").trim();
  const type = provider.type || "";
  const lower = subType.toLowerCase();

  if (type === "OpenAI" || type === "Azure") {
    if (lower.startsWith("gpt-image") || lower.includes("dall-e")) {
      return true;
    }
  }
  if (type === "Gemini") {
    if (lower.includes("imagen-") || lower === "gemini-2.5-flash-image" ||
        lower.includes("gemini-3.1-flash-image") || lower.includes("gemini-3-pro-image")) {
      return true;
    }
  }
  if (type === "Alibaba Cloud") {
    if (lower.includes("wanx") && (lower.includes("t2i") || lower.includes("wanx-v"))) {
      return true;
    }
  }
  if (type === "Volcano Engine") {
    if (lower.includes("seedream")) {
      return true;
    }
  }
  if (type === "Grok") {
    if (lower.includes("grok-2-image") || lower === "grok-2-image-latest") {
      return true;
    }
  }
  if (lower.includes("dall-e") || lower.startsWith("gpt-image")) {
    return true;
  }
  if (lower.includes("imagen-") && lower.includes("generate")) {
    return true;
  }
  if (lower.includes("seedream")) {
    return true;
  }
  if (lower.includes("wanx") && (lower.includes("t2i") || lower.includes("wanx-v"))) {
    return true;
  }
  if (/(^|-)image(-|preview)/i.test(subType) && !lower.includes("embedding") && type === "Gemini") {
    return true;
  }
  return false;
}

export type ToolFunction = {
  name: string
  description: string
  testContent: string
}

export function getToolFunctions(tool: { type?: string; subType?: string }): ToolFunction[] {
  const type = tool.type
  const subType = tool.subType

  if (type === "time") {
    return [{
      name: "time",
      description: "Get current time or perform time calculations",
      testContent: JSON.stringify({tool: "time", arguments: {operation: "current", timezone: "Asia/Shanghai"}}, null, 2),
    }]
  }
  if (type === "web_search") {
    return [{
      name: "web_search",
      description: "Search the web using the configured search engine",
      testContent: JSON.stringify({tool: "web_search", arguments: {query: "OpenAgent web search", count: 3, language: "en", country: "us"}}, null, 2),
    }]
  }
  if (type === "shell") {
    return [{
      name: "shell",
      description: "Execute shell commands on the server",
      testContent: JSON.stringify({tool: "shell", arguments: {command: "echo hello"}}, null, 2),
    }]
  }
  if (type === "local_file") {
    return [
      {name: "local_special_dirs", description: "Return Desktop, Documents, and Downloads paths for the OS user running the OpenAgent backend", testContent: JSON.stringify({tool: "local_special_dirs", arguments: {}}, null, 2)},
      {name: "local_file_scan", description: "Scan an absolute local directory for all files and subdirectories", testContent: JSON.stringify({tool: "local_file_scan", arguments: {root: "/absolute/path/to/Desktop"}}, null, 2)},
      {name: "local_file_read", description: "Read text from a local file", testContent: JSON.stringify({tool: "local_file_read", arguments: {path: "/absolute/path/to/Desktop/report.pdf", offset: 0, limit: 12000}}, null, 2)},
      {name: "local_file_write", description: "Write text to an absolute local path", testContent: JSON.stringify({tool: "local_file_write", arguments: {path: "/absolute/path/to/Desktop/Project Summaries/summary.md", content: "# Summary\n\nProject notes.", overwrite: false}}, null, 2)},
      {name: "local_file_move", description: "Move one local file after explicit user confirmation", testContent: JSON.stringify({tool: "local_file_move", arguments: {source: "/absolute/path/to/Desktop/report.pdf", target: "/absolute/path/to/Desktop/Project/report.pdf", confirmed: true, overwrite: false}}, null, 2)},
    ]
  }
  if (type === "web_fetch") {
    return [{
      name: "web_fetch",
      description: "Fetch and extract content from a web URL",
      testContent: JSON.stringify({tool: "web_fetch", arguments: {url: "https://openagentai.org", purpose: "get_list", max_length: 3000}}, null, 2),
    }]
  }
  if (type === "web_browser") {
    return [{
      name: "web_browser",
      description: "Open a web page in a browser and capture a screenshot",
      testContent: JSON.stringify({tool: "web_browser", arguments: {url: "https://openagentai.org", timeout: 60}}, null, 2),
    }]
  }
  if (type === "browser_use") {
    return [{
      name: "browser_use",
      description: "Automate browser interactions using AI-driven control",
      testContent: JSON.stringify({tool: "browser_use_open", arguments: {url: "https://openagentai.org"}}, null, 2),
    }]
  }
  if (type === "gui") {
    return [
      {name: "win_open_application", description: "Launch app", testContent: JSON.stringify({tool: "win_open_application", arguments: {target: "calc", method: "auto", wait_seconds: 2}}, null, 2)},
      {name: "win_focus_window", description: "Focus top-level window", testContent: JSON.stringify({tool: "win_focus_window", arguments: {title_contains: "Calculator"}}, null, 2)},
      {name: "win_find_element", description: "Find UIA element by criteria", testContent: JSON.stringify({tool: "win_find_element", arguments: {window_title_contains: "Calculator", control_type: "button", name_contains: "1"}}, null, 2)},
      {name: "win_interact", description: "click/set_text/get_text/hotkey", testContent: JSON.stringify({tool: "win_interact", arguments: {action: "click", element_id: "el_1"}}, null, 2)},
      {name: "win_wait", description: "Wait by time/window condition", testContent: JSON.stringify({tool: "win_wait", arguments: {window_title_contains: "Calculator", timeout_seconds: 10}}, null, 2)},
      {name: "win_assert", description: "Assert window/file/text condition", testContent: JSON.stringify({tool: "win_assert", arguments: {check: "window_exists", window_title_contains: "Calculator"}}, null, 2)},
      {name: "win_read_system_metric", description: "Read system metric (CPU, memory, etc.)", testContent: JSON.stringify({tool: "win_read_system_metric", arguments: {metric: "cpu_percent", duration_seconds: 10, interval_seconds: 1, aggregation: "avg"}}, null, 2)},
      {name: "win_word_write_and_save", description: "Write content to Word and save", testContent: JSON.stringify({tool: "win_word_write_and_save", arguments: {content: "CPU avg: 12.34%", file_name: "CPU_Report.docx", overwrite: true}}, null, 2)},
      {name: "win_safety_emergency_stop", description: "Emergency stop — halt all automation", testContent: JSON.stringify({tool: "win_safety_emergency_stop", arguments: {}}, null, 2)},
    ]
  }
  if (type === "video_download") {
    return [
      {name: "video_info", description: "Get video metadata (no download)", testContent: JSON.stringify({tool: "video_info", arguments: {url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}}, null, 2)},
      {name: "video_download", description: "Download video file", testContent: JSON.stringify({tool: "video_download", arguments: {url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", output_dir: "videos", format: "bestvideo+bestaudio/best"}}, null, 2)},
      {name: "video_audio_extract", description: "Extract audio from video", testContent: JSON.stringify({tool: "video_audio_extract", arguments: {url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", output_dir: "audio", audio_format: "mp3", audio_quality: "0"}}, null, 2)},
    ]
  }
  if (type === "office") {
    const allOffice: ToolFunction[] = [
      {name: "word_read", description: "Read content from a Word document", testContent: JSON.stringify({tool: "word_read", arguments: {path: "/path/to/document.docx"}}, null, 2)},
      {name: "word_write", description: "Write content to a Word document", testContent: JSON.stringify({tool: "word_write", arguments: {path: "/path/to/output.docx", content: "Hello, World!\nThis is a new paragraph."}}, null, 2)},
      {name: "excel_read", description: "Read data from an Excel spreadsheet", testContent: JSON.stringify({tool: "excel_read", arguments: {path: "/path/to/spreadsheet.xlsx", sheet: "Sheet1"}}, null, 2)},
      {name: "excel_write", description: "Write data to an Excel spreadsheet", testContent: JSON.stringify({tool: "excel_write", arguments: {path: "/path/to/output.xlsx", data: "Name,Age\nAlice,30\nBob,25", sheet: "Sheet1"}}, null, 2)},
      {name: "pptx_read", description: "Read content from a PowerPoint presentation", testContent: JSON.stringify({tool: "pptx_read", arguments: {path: "/path/to/presentation.pptx"}}, null, 2)},
      {name: "pptx_write", description: "Write content to a PowerPoint presentation", testContent: JSON.stringify({tool: "pptx_write", arguments: {path: "/path/to/output.pptx", slides: ["Slide 1 title\nSlide 1 content", "Slide 2 title\nSlide 2 content"]}}, null, 2)},
    ]
    const subTypeMap: Record<string, ToolFunction[]> = {
      "Word Read": [allOffice[0]],
      "Word Write": [allOffice[1]],
      "Excel Read": [allOffice[2]],
      "Excel Write": [allOffice[3]],
      "PowerPoint Read": [allOffice[4]],
      "PowerPoint Write": [allOffice[5]],
    }
    return subTypeMap[subType ?? ""] ?? allOffice
  }
  return []
}

export function getThinkingModelMaxTokens(subType) {
  if (subType.includes("claude")) {
    if (subType.includes("4")) {
      if (subType.includes("sonnet")) {
        return 64000;
      } else if (subType.includes("opus")) {
        return 32000;
      }
    } else if (subType.includes("3-7") || subType.includes("sonnet")) {
      return 64000;
    }
  }
  return 0;
}
