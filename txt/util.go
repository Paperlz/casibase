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

package txt

import (
	"io"
	"os"
	"path/filepath"

	"github.com/the-open-agent/openagent/util"
)

func getTempFilePathFromUrl(url string) (string, error) {
	buffer, err := util.DownloadFile(url)
	if err != nil {
		return "", err
	}

	file, err := os.CreateTemp("", filepath.Base(url))
	if err != nil {
		return "", err
	}

	_, err = io.Copy(file, buffer)
	if err != nil {
		file.Close()
		return "", err
	}
	if err = file.Close(); err != nil {
		return "", err
	}

	return file.Name(), nil
}
