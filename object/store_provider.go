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

package object

func SyncDefaultProvidersToStore(store *Store) error {
	defaultStore, err := GetDefaultStore(store.Owner)
	if err != nil {
		return err
	}
	if defaultStore == nil {
		return nil
	}

	if store.ImageProvider == "" && defaultStore.ImageProvider != "" {
		store.ImageProvider = defaultStore.ImageProvider
	}
	if store.TextToSpeechProvider == "Browser Built-In" && defaultStore.TextToSpeechProvider != "" {
		store.TextToSpeechProvider = defaultStore.TextToSpeechProvider
	}
	if store.SpeechToTextProvider == "Browser Built-In" && defaultStore.SpeechToTextProvider != "" {
		store.SpeechToTextProvider = defaultStore.SpeechToTextProvider
	}
	if store.McpServer == "" && defaultStore.McpServer != "" {
		store.McpServer = defaultStore.McpServer
	}

	return nil
}
