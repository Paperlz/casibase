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

import React from "react";
import {Avatar, Button, Card, Flex, Tag, Typography} from "antd";
import {DownloadOutlined, FileTextOutlined} from "@ant-design/icons";
import {saveAs} from "file-saver";
import i18next from "i18next";

const listStyle = {width: "100%", maxWidth: 760, marginBottom: 12};
const cardStyle = {width: "100%"};
const rowStyle = {width: "100%"};
const metaStyle = {flex: 1, minWidth: 0};
const tagStyle = {width: "fit-content", marginInlineEnd: 0};
const officeAvatarStyle = {backgroundColor: "transparent"};

const officeIconConfig = {
  word: {
    color: "#185ABD",
    panelColor: "#2B7CD3",
    letter: "W",
  },
  excel: {
    color: "#107C41",
    panelColor: "#21A366",
    letter: "X",
  },
  powerpoint: {
    color: "#C43E1C",
    panelColor: "#ED6C47",
    letter: "P",
  },
};

function OfficeFileIcon({type}) {
  const config = officeIconConfig[type];

  return (
    <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="14" y="4" width="30" height="40" rx="4" fill={config.panelColor} />
      {type === "excel" ? (
        <>
          <path d="M28 12h10M28 20h10M28 28h10M28 36h10M28 12v24M38 12v24" stroke="#FFFFFF" strokeWidth="2" opacity="0.85" />
        </>
      ) : type === "powerpoint" ? (
        <>
          <circle cx="31" cy="24" r="9" fill="#FFFFFF" opacity="0.9" />
          <path d="M31 15a9 9 0 0 1 9 9h-9z" fill={config.color} />
        </>
      ) : (
        <>
          <path d="M27 14h11M27 20h11M27 26h11M27 32h8" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        </>
      )}
      <rect x="4" y="10" width="25" height="28" rx="3" fill={config.color} />
      <text
        x="16.5"
        y="30"
        fill="#FFFFFF"
        fontFamily="Arial, sans-serif"
        fontSize="18"
        fontWeight="700"
        textAnchor="middle"
      >
        {config.letter}
      </text>
    </svg>
  );
}

function getFileExt(fileName, mimeType) {
  if (fileName) {
    const dot = fileName.lastIndexOf(".");
    if (dot >= 0 && dot < fileName.length - 1) {
      return fileName.substring(dot + 1).toUpperCase();
    }
  }
  if (mimeType) {
    const part = mimeType.split("/").pop();
    if (part && part !== mimeType) {
      return part.toUpperCase();
    }
  }
  return "FILE";
}

function getFileIcon(ext) {
  switch (ext.toLowerCase()) {
  case "docx":
    return <OfficeFileIcon type="word" />;
  case "xlsx":
  case "csv":
    return <OfficeFileIcon type="excel" />;
  case "pptx":
    return <OfficeFileIcon type="powerpoint" />;
  case "txt":
    return <FileTextOutlined />;
  default:
    return <FileTextOutlined />;
  }
}

function isOfficeFile(ext) {
  return ["docx", "xlsx", "csv", "pptx"].includes(ext.toLowerCase());
}

async function downloadResource(e, href, fileName) {
  e.preventDefault();
  try {
    const response = await fetch(href);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const blob = await response.blob();
    saveAs(blob, fileName);
  } catch (error) {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

/**
 * Extracts resource_link items from a message's toolCalls array.
 * Returns [] when no resources are present.
 */
export function extractGeneratedResources(toolCalls) {
  const resources = [];
  (toolCalls || []).forEach(toolCall => {
    if (!toolCall.content) {return;}
    let content;
    try {
      content = JSON.parse(toolCall.content);
    } catch (e) {
      return;
    }
    if (!Array.isArray(content)) {return;}
    content.forEach(item => {
      if (item && item.type === "resource_link" && typeof item.uri === "string" && item.uri !== "") {
        resources.push(item);
      }
    });
  });
  return resources;
}

/**
 * Renders a list of download cards for AI-generated resource files.
 * Each card shows the file name, type tag, and a download button.
 *
 * @param {Array} resources - Array of resource_link objects {uri, name, mimeType}
 */
const GeneratedResourceList = ({resources}) => {
  if (!resources || resources.length === 0) {
    return null;
  }

  return (
    <Flex vertical gap="small" style={listStyle}>
      {resources.map((resource, idx) => {
        const href = resource.uri;
        const fileName = resource.name || resource.uri;
        const ext = getFileExt(resource.name, resource.mimeType);
        return (
          <Card key={`${resource.uri}-${idx}`} size="small" style={cardStyle}>
            <Flex align="center" gap="middle" style={rowStyle}>
              <Avatar
                shape="square"
                size={48}
                style={isOfficeFile(ext) ? officeAvatarStyle : undefined}
                icon={getFileIcon(ext)}
              />
              <Flex vertical gap={2} style={metaStyle}>
                <Typography.Text strong ellipsis={{tooltip: fileName}}>
                  {fileName}
                </Typography.Text>
                <Tag style={tagStyle}>{ext}</Tag>
              </Flex>
              <Button
                href={href}
                download={fileName}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => downloadResource(e, href, fileName)}
                icon={<DownloadOutlined />}
              >
                {i18next.t("general:Download")}
              </Button>
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
};

export default GeneratedResourceList;
