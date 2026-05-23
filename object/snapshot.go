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

package object

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/the-open-agent/openagent/util"
	"xorm.io/core"
)

const (
	SnapshotStateActive     = "Active"
	SnapshotStateRolledBack = "RolledBack"
)

type Snapshot struct {
	Owner       string `xorm:"varchar(100) notnull pk" json:"owner"`
	Name        string `xorm:"varchar(100) notnull pk" json:"name"`
	CreatedTime string `xorm:"varchar(100)" json:"createdTime"`

	Tool           string         `xorm:"varchar(100)" json:"tool"`
	Action         string         `xorm:"varchar(100)" json:"action"`
	Path           string         `xorm:"varchar(1000)" json:"path"`
	Source         string         `xorm:"varchar(1000)" json:"source"`
	Target         string         `xorm:"varchar(1000)" json:"target"`
	Files          []SnapshotFile `xorm:"mediumtext" json:"files"`
	Diff           string         `xorm:"mediumtext" json:"diff"`
	State          string         `xorm:"varchar(100)" json:"state"`
	ErrorText      string         `xorm:"mediumtext" json:"errorText"`
	RolledBackTime string         `xorm:"varchar(100)" json:"rolledBackTime"`
}

type SnapshotFile struct {
	Path          string `json:"path"`
	ChangeType    string `json:"changeType"`
	BeforeExists  bool   `json:"beforeExists"`
	BeforeHash    string `json:"beforeHash"`
	BeforeContent string `json:"beforeContent,omitempty"`
	BeforeMode    int64  `json:"beforeMode"`
	AfterExists   bool   `json:"afterExists"`
	AfterHash     string `json:"afterHash"`
	AfterMode     int64  `json:"afterMode"`
}

type snapshotFileState struct {
	Path    string
	Exists  bool
	Hash    string
	Content []byte
	Mode    int64
}

func AddSnapshot(snapshot *Snapshot) (bool, error) {
	affected, err := adapter.engine.Insert(snapshot)
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

func getSnapshot(owner string, name string) (*Snapshot, error) {
	snapshot := Snapshot{Owner: owner, Name: name}
	existed, err := adapter.engine.Get(&snapshot)
	if err != nil {
		return &snapshot, err
	}
	if existed {
		return &snapshot, nil
	}
	return nil, nil
}

func GetSnapshot(id string) (*Snapshot, error) {
	owner, name, err := util.GetOwnerAndNameFromIdWithError(id)
	if err != nil {
		return nil, err
	}
	snapshot, err := getSnapshot(owner, name)
	if err != nil || snapshot == nil {
		return snapshot, err
	}
	clearSnapshotBeforeContent(snapshot)
	return snapshot, nil
}

func GetSnapshots(owner string) ([]*Snapshot, error) {
	snapshots := []*Snapshot{}
	err := adapter.engine.Desc("created_time").Find(&snapshots, &Snapshot{Owner: owner})
	if err != nil {
		return snapshots, err
	}
	clearSnapshotsBeforeContent(snapshots)
	return snapshots, nil
}

func GetSnapshotCount(owner, field, value string) (int64, error) {
	session := GetDbSession(owner, -1, -1, field, value, "", "")
	return session.Count(&Snapshot{})
}

func GetPaginationSnapshots(owner string, offset, limit int, field, value, sortField, sortOrder string) ([]*Snapshot, error) {
	snapshots := []*Snapshot{}
	session := GetDbSession(owner, offset, limit, field, value, sortField, sortOrder)
	err := session.Find(&snapshots)
	if err != nil {
		return snapshots, err
	}
	clearSnapshotsBeforeContent(snapshots)
	return snapshots, nil
}

func RollbackSnapshot(id string) (bool, error) {
	owner, name, err := util.GetOwnerAndNameFromIdWithError(id)
	if err != nil {
		return false, err
	}
	snapshot, err := getSnapshot(owner, name)
	if err != nil {
		return false, err
	}
	if snapshot == nil {
		return false, fmt.Errorf("snapshot not found: %s", id)
	}
	if snapshot.State == SnapshotStateRolledBack {
		return false, fmt.Errorf("snapshot already rolled back: %s", id)
	}

	for _, file := range snapshot.Files {
		if err = validateSnapshotAfterState(file); err != nil {
			return false, err
		}
	}

	for i := len(snapshot.Files) - 1; i >= 0; i-- {
		if err = rollbackSnapshotFile(snapshot.Files[i]); err != nil {
			return false, err
		}
	}

	snapshot.State = SnapshotStateRolledBack
	snapshot.ErrorText = ""
	snapshot.RolledBackTime = util.GetCurrentTime()
	affected, err := adapter.engine.ID(core.PK{snapshot.Owner, snapshot.Name}).
		Cols("state", "error_text", "rolled_back_time").Update(snapshot)
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

func clearSnapshotsBeforeContent(snapshots []*Snapshot) {
	for _, snapshot := range snapshots {
		clearSnapshotBeforeContent(snapshot)
	}
}

func clearSnapshotBeforeContent(snapshot *Snapshot) {
	for i := range snapshot.Files {
		snapshot.Files[i].BeforeContent = ""
	}
}

func captureSnapshotFile(path string) (snapshotFileState, error) {
	state := snapshotFileState{Path: filepath.Clean(path)}
	info, err := os.Stat(state.Path)
	if err != nil {
		if os.IsNotExist(err) {
			return state, nil
		}
		return state, err
	}

	state.Exists = true
	state.Mode = int64(info.Mode().Perm())
	if info.IsDir() {
		return state, nil
	}

	state.Content, err = os.ReadFile(state.Path)
	if err != nil {
		return state, err
	}
	state.Hash = hashSnapshotContent(state.Content)
	return state, nil
}

func validateSnapshotAfterState(file SnapshotFile) error {
	current, err := captureSnapshotFile(file.Path)
	if err != nil {
		return err
	}
	if current.Exists != file.AfterExists {
		return fmt.Errorf("snapshot rollback conflict: %s existence changed", file.Path)
	}
	if !file.AfterExists {
		return nil
	}
	if current.Hash != file.AfterHash {
		return fmt.Errorf("snapshot rollback conflict: %s content changed", file.Path)
	}
	if current.Mode != file.AfterMode {
		return fmt.Errorf("snapshot rollback conflict: %s mode changed", file.Path)
	}
	return nil
}

func rollbackSnapshotFile(file SnapshotFile) error {
	if !file.BeforeExists {
		if _, err := os.Stat(file.Path); err == nil {
			return os.Remove(file.Path)
		} else if os.IsNotExist(err) {
			return nil
		} else {
			return err
		}
	}

	content, err := base64.StdEncoding.DecodeString(file.BeforeContent)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(file.Path), 0o755); err != nil {
		return err
	}
	mode := os.FileMode(file.BeforeMode)
	if mode == 0 {
		mode = 0o644
	}
	if err = os.WriteFile(file.Path, content, mode); err != nil {
		return err
	}
	return os.Chmod(file.Path, mode)
}

func newSnapshot(owner string, action string, path string, source string, target string, files []SnapshotFile, diff string) *Snapshot {
	return &Snapshot{
		Owner:       owner,
		Name:        fmt.Sprintf("snapshot_%s", util.GenerateId()),
		CreatedTime: util.GetCurrentTime(),
		Tool:        "local_file",
		Action:      action,
		Path:        path,
		Source:      source,
		Target:      target,
		Files:       files,
		Diff:        diff,
		State:       SnapshotStateActive,
	}
}

func makeSnapshotFile(before snapshotFileState, after snapshotFileState) SnapshotFile {
	return SnapshotFile{
		Path:          after.Path,
		ChangeType:    getSnapshotChangeType(before, after),
		BeforeExists:  before.Exists,
		BeforeHash:    before.Hash,
		BeforeContent: base64.StdEncoding.EncodeToString(before.Content),
		BeforeMode:    before.Mode,
		AfterExists:   after.Exists,
		AfterHash:     after.Hash,
		AfterMode:     after.Mode,
	}
}

func getSnapshotChangeType(before snapshotFileState, after snapshotFileState) string {
	if !before.Exists && after.Exists {
		return "created"
	}
	if before.Exists && !after.Exists {
		return "deleted"
	}
	if before.Hash != after.Hash || before.Mode != after.Mode {
		return "modified"
	}
	return "unchanged"
}

func snapshotFileChanged(before snapshotFileState, after snapshotFileState) bool {
	return before.Exists != after.Exists || before.Hash != after.Hash || before.Mode != after.Mode
}

func hashSnapshotContent(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func buildSnapshotDiff(files []SnapshotFile, beforeStates map[string]snapshotFileState, afterStates map[string]snapshotFileState) string {
	var builder strings.Builder
	for _, file := range files {
		before := beforeStates[file.Path]
		after := afterStates[file.Path]
		builder.WriteString(fmt.Sprintf("--- %s\n", file.Path))
		builder.WriteString(fmt.Sprintf("+++ %s\n", file.Path))
		builder.WriteString(fmt.Sprintf("@@ %s @@\n", file.ChangeType))
		if before.Exists && after.Exists && utf8.Valid(before.Content) && utf8.Valid(after.Content) {
			appendLineDiff(&builder, string(before.Content), string(after.Content))
		} else if before.Exists && !after.Exists {
			builder.WriteString("- file deleted\n")
		} else if !before.Exists && after.Exists {
			builder.WriteString("+ file created\n")
		} else {
			builder.WriteString("binary or unreadable file changed\n")
		}
		builder.WriteString("\n")
	}
	return builder.String()
}

func appendLineDiff(builder *strings.Builder, before string, after string) {
	if before == after {
		builder.WriteString(" file unchanged\n")
		return
	}
	beforeLines := strings.Split(strings.TrimSuffix(before, "\n"), "\n")
	afterLines := strings.Split(strings.TrimSuffix(after, "\n"), "\n")
	for _, line := range beforeLines {
		if line != "" {
			builder.WriteString("- ")
			builder.WriteString(line)
			builder.WriteString("\n")
		}
	}
	for _, line := range afterLines {
		if line != "" {
			builder.WriteString("+ ")
			builder.WriteString(line)
			builder.WriteString("\n")
		}
	}
}
