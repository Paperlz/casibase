// Copyright 2024 The OpenAgent Authors. All Rights Reserved.
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

package model

import (
	"fmt"
	"strings"
)

// ProviderSupportsCdnUrl returns whether the given provider type can resolve
// CDN image URLs when they appear in message text. Providers that cannot fetch
// external URLs (e.g. DeepSeek) need images embedded as base64 data URLs.
func ProviderSupportsCdnUrl(providerType string) bool {
	switch providerType {
	case "DeepSeek":
		return false
	}
	return true
}

// EmbedCdnImagesInText downloads any CDN image URLs found in text and replaces
// them with inline base64 data URLs so that providers without external URL access
// can still process image content. Non-image content and failed downloads are
// left unchanged (best-effort).
func EmbedCdnImagesInText(text string) (string, error) {
	urls, textWithoutImages := extractImagesURL(text)
	if len(urls) == 0 {
		return text, nil
	}

	result := textWithoutImages
	for _, u := range urls {
		imageDataURL, err := getImageRefinedText(u)
		if err != nil {
			// Best-effort: skip images that can't be fetched
			continue
		}
		result += fmt.Sprintf(` <img src="%s" style="max-width:100%%">`, imageDataURL)
	}
	return result, nil
}

// ApplyNoCdnToMessages returns a new slice where CDN image URLs in each message's
// text have been replaced with base64 data URLs. If a message already has TextNoCdn
// set (populated before DB save), that value is used directly; otherwise the CDN
// URLs are downloaded on demand.
func ApplyNoCdnToMessages(messages []*RawMessage) []*RawMessage {
	result := make([]*RawMessage, len(messages))
	for i, msg := range messages {
		if msg.TextNoCdn != "" {
			clone := *msg
			clone.Text = msg.TextNoCdn
			clone.TextNoCdn = ""
			result[i] = &clone
		} else if strings.Contains(msg.Text, "http") {
			embedded, err := EmbedCdnImagesInText(msg.Text)
			if err != nil || embedded == msg.Text {
				result[i] = msg
			} else {
				clone := *msg
				clone.Text = embedded
				result[i] = &clone
			}
		} else {
			result[i] = msg
		}
	}
	return result
}
