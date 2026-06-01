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

package model

import (
	"encoding/base64"
	"fmt"
	"html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/the-open-agent/openagent/proxy"
)

var (
	imageBRRegexp       = regexp.MustCompile(`(?i)<br\s*/?>`)
	imageTagRegexp      = regexp.MustCompile(`(?is)<img\b[^>]*>`)
	imageSrcRegexp      = regexp.MustCompile(`(?is)<img\b[^>]*\bsrc\s*=\s*("[^"]*"|'[^']*'|[^'"\s>]+)[^>]*>`)
	bareHTTPImageRegexp = regexp.MustCompile(`(?i)https?://[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?`)
)

func extractImageDataURLsFromMessage(message string) ([]string, string, error) {
	imageSources, messageText := extractImageSourcesFromMessage(message)
	res := make([]string, 0, len(imageSources))
	for _, imageSource := range imageSources {
		imageDataURL, err := imageSourceToDataURL(imageSource)
		if err != nil {
			return nil, "", err
		}
		res = append(res, imageDataURL)
	}

	return res, messageText, nil
}

func extractImageSourcesFromMessage(message string) ([]string, string) {
	message = strings.ReplaceAll(message, "&nbsp;", " ")
	message = imageBRRegexp.ReplaceAllString(message, " ")

	res := []string{}
	for _, match := range imageSrcRegexp.FindAllStringSubmatch(message, -1) {
		if len(match) < 2 {
			continue
		}
		res = append(res, cleanImageSource(match[1]))
	}

	message = imageTagRegexp.ReplaceAllString(message, "")

	bareURLs := bareHTTPImageRegexp.FindAllString(message, -1)
	for _, bareURL := range bareURLs {
		res = append(res, cleanImageSource(bareURL))
	}
	message = bareHTTPImageRegexp.ReplaceAllString(message, "")

	return res, message
}

func cleanImageSource(src string) string {
	src = strings.TrimSpace(src)
	if len(src) >= 2 {
		first := src[0]
		last := src[len(src)-1]
		if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
			src = src[1 : len(src)-1]
		}
	}
	return html.UnescapeString(strings.TrimSpace(src))
}

func imageSourceToDataURL(src string) (string, error) {
	src = cleanImageSource(src)
	lowerSrc := strings.ToLower(src)
	if strings.HasPrefix(lowerSrc, "data:image/") {
		if !strings.Contains(lowerSrc, ";base64,") {
			return "", fmt.Errorf("image data URL is not base64 encoded")
		}
		return src, nil
	}

	if path, ok, err := storageURLToLocalPath(src); ok || err != nil {
		if err != nil {
			return "", err
		}
		return localImageFileToDataURL(path)
	}

	if strings.HasPrefix(lowerSrc, "http://") || strings.HasPrefix(lowerSrc, "https://") {
		return httpImageToDataURL(src)
	}

	return "", fmt.Errorf("unsupported image source: %s", src)
}

func storageURLToLocalPath(src string) (string, bool, error) {
	src = strings.TrimSpace(src)
	if src == "" {
		return "", false, nil
	}

	u, err := url.Parse(src)
	if err != nil {
		return "", false, err
	}

	escapedPath := u.EscapedPath()
	if escapedPath == "" {
		escapedPath = u.Path
	}
	if escapedPath == "" && u.Scheme == "" {
		escapedPath = src
		if index := strings.IndexAny(escapedPath, "?#"); index >= 0 {
			escapedPath = escapedPath[:index]
		}
	}

	path, err := url.PathUnescape(escapedPath)
	if err != nil {
		return "", false, err
	}

	var localPath string
	switch {
	case path == "/storage" || path == "storage":
		return "", true, fmt.Errorf("storage image path is empty: %s", src)
	case strings.HasPrefix(path, "/storage/"):
		localPath = strings.TrimPrefix(path, "/storage")
	case strings.HasPrefix(path, "storage/"):
		localPath = strings.TrimPrefix(path, "storage")
	default:
		return "", false, nil
	}

	localPath = strings.Replace(localPath, "|", ":", 1)
	if strings.HasPrefix(localPath, "/") && hasWindowsDrivePrefix(localPath[1:]) {
		localPath = localPath[1:]
	}

	return localPath, true, nil
}

func hasWindowsDrivePrefix(path string) bool {
	if len(path) < 3 {
		return false
	}
	drive := path[0]
	return ((drive >= 'a' && drive <= 'z') || (drive >= 'A' && drive <= 'Z')) &&
		path[1] == ':' && (path[2] == '/' || path[2] == '\\')
}

func localImageFileToDataURL(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return imageBytesToDataURL(data, "", path)
}

func httpImageToDataURL(src string) (string, error) {
	client := proxy.GetHttpClient(src)
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Get(src)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("download image failed with status code %d: %s", resp.StatusCode, src)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	sourcePath := src
	if u, err := url.Parse(src); err == nil {
		sourcePath = u.Path
	}
	return imageBytesToDataURL(data, resp.Header.Get("Content-Type"), sourcePath)
}

func imageBytesToDataURL(data []byte, contentType string, sourcePath string) (string, error) {
	mimeType := imageMIMEFromContentType(contentType)
	if mimeType == "" {
		mimeType = imageMIMEFromPath(sourcePath)
	}
	if mimeType == "" && len(data) > 0 {
		mimeType = imageMIMEFromContentType(http.DetectContentType(data))
	}
	if mimeType == "" {
		return "", fmt.Errorf("cannot detect image MIME type: %s", sourcePath)
	}

	return fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(data)), nil
}

func imageMIMEFromContentType(contentType string) string {
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		return ""
	}

	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.Split(contentType, ";")[0]
	}

	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if strings.HasPrefix(mediaType, "image/") {
		return mediaType
	}
	return ""
}

func imageMIMEFromPath(path string) string {
	return imageMIMEFromContentType(mime.TypeByExtension(strings.ToLower(filepath.Ext(path))))
}
