// Copyright 2026 The Casibase Authors. All Rights Reserved.
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

package tool

import (
	"fmt"

	"github.com/casibase/casibase/agent/builtin_tool"
	"github.com/casibase/casibase/i18n"
)

// Provider supplies LLM-callable tools (object.Provider category "Tool").
type Provider interface {
	BuiltinTools() []builtin_tool.BuiltinTool
}

// NewProvider instantiates a Tool provider implementation from category and type.
func NewProvider(category string, typ string, lang string) (Provider, error) {
	if category != "Tool" {
		return nil, fmt.Errorf(i18n.Translate(lang, "tool:expected category Tool, got %s"), category)
	}
	switch typ {
	case "Time":
		return &TimeProvider{}, nil
	case "WebSearch":
		return &WebSearchProvider{}, nil
	default:
		return nil, fmt.Errorf(i18n.Translate(lang, "tool:unsupported tool provider type: %s"), typ)
	}
}
