// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package office

import (
	"crypto/rand"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type smartArtNodeRef struct {
	ModelID string
	PresIDs []string
	Index   int
	Text    string
}

type smartArtPresCandidate struct {
	ID    string
	Index int
	Score int
}

type smartArtResizeNode struct {
	ContentID         string
	ParTransID        string
	SibTransID        string
	CxnID             string
	PresNodeID        string
	PresSibTransID    string
	ContentPt         *xmlNode
	ParTransPt        *xmlNode
	SibTransPt        *xmlNode
	PresNodePt        *xmlNode
	PresSibTransPt    *xmlNode
	NormalCxn         *xmlNode
	PresOfCxn         *xmlNode
	NodePresParOf     *xmlNode
	SibTransPresParOf *xmlNode
}

type smartArtResizeGroup struct {
	ContentIDs        []string
	PointIDs          []string
	CxnIDs            []string
	PresIDs           []string
	TransitionPresIDs []string
	TransitionCxnIDs  []string
	RootCxn           *xmlNode
	RootSibTransID    string
	Root              smartArtResizeUnit
	Children          []smartArtResizeUnit
}

type smartArtResizeUnit struct {
	ContentID         string
	PointIDs          []string
	CxnIDs            []string
	PresIDs           []string
	TransitionPresIDs []string
	TransitionCxnIDs  []string
	NormalCxn         *xmlNode
	SibTransID        string
}

type smartArtResizeModel struct {
	PtList        *xmlNode
	CxnList       *xmlNode
	DocID         string
	DiagramPresID string
	Mode          string
	Nodes         []smartArtResizeNode
	Groups        []smartArtResizeGroup
	FixedNodes    int
	GroupNodes    int
	ResizeStep    int
}

func analyzeSmartArts(pkg *Package, slide *xmlNode, ref slideRef, objectByID map[string]*SlideObject) ([]SmartArtInfo, error) {
	rels, err := pkg.Relationships(ref.PartName)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]Relationship, len(rels.Items))
	for _, rel := range rels.Items {
		byID[rel.ID] = rel
	}

	frames := smartArtFrames(slide)
	result := make([]SmartArtInfo, 0, len(frames))
	for order, frame := range frames {
		shapeID, shapeName := shapeIdentity(frame, order+1)
		info := SmartArtInfo{
			SmartArtID: fmt.Sprintf("s%02d_sa%s", ref.Index, shapeID),
			ShapeID:    shapeID,
			ShapeName:  shapeName,
			Editable:   true,
		}
		if object := objectByID[shapeID]; object != nil {
			info.Geometry = object.Geometry
		} else {
			info.Geometry = containerGeometry(frame)
		}

		dataRelID := smartArtRelIDs(frame).attr(nsOfficeRels, "dm")
		rel, ok := byID[dataRelID]
		if !ok || rel.Type != RelationshipTypeDiagramData || rel.Mode != TargetInternal {
			info.Editable = false
			info.Reason = "diagram data relationship not found"
			result = append(result, info)
			continue
		}
		dataPart, err := ResolveTarget(ref.PartName, rel.Target)
		if err != nil || !pkg.HasPart(dataPart) {
			info.Editable = false
			info.Reason = "diagram data part not found"
			result = append(result, info)
			continue
		}
		dataRoot, err := pkg.xmlPart(dataPart)
		if err != nil {
			info.Editable = false
			info.Reason = "diagram data part cannot be parsed"
			result = append(result, info)
			continue
		}
		drawingRoot, _, err := smartArtDrawingRoot(pkg, ref.PartName, rels, dataRoot)
		if err != nil {
			info.Editable = false
			info.Reason = "diagram drawing part cannot be resolved: " + err.Error()
			result = append(result, info)
			continue
		}
		nodes := smartArtNodeRefs(dataRoot, drawingRoot)
		if len(nodes) == 0 {
			info.Editable = false
			info.Reason = "editable SmartArt nodes not found"
		}
		for index, node := range nodes {
			info.Nodes = append(info.Nodes, SmartArtNodeInfo{
				NodeID:         fmt.Sprintf("s%02d_sa%s_n%02d", ref.Index, shapeID, index+1),
				Text:           node.Text,
				ParagraphCount: max(len(strings.Split(node.Text, "\n")), 1),
				Editable:       true,
				modelID:        node.ModelID,
				presIDs:        node.PresIDs,
			})
		}
		if model, reason := smartArtResizeModelFromData(dataRoot); model != nil {
			info.Resizable = true
			info.ResizeMode = model.Mode
			info.Structure = smartArtStructureInfo(model, info.Nodes)
		} else {
			info.ResizeReason = reason
		}
		result = append(result, info)
	}
	return result, nil
}

func smartArtStructureInfo(model *smartArtResizeModel, nodes []SmartArtNodeInfo) *SmartArtStructureInfo {
	if model == nil {
		return nil
	}
	nodeIDByModelID := make(map[string]string, len(nodes))
	for _, node := range nodes {
		if node.modelID != "" {
			nodeIDByModelID[node.modelID] = node.NodeID
		}
	}
	info := &SmartArtStructureInfo{
		Kind:           model.Mode,
		ResizeStep:     model.ResizeStep,
		FixedNodeCount: model.FixedNodes,
		AppendBehavior: smartArtAppendBehavior(model.Mode),
	}
	switch model.Mode {
	case "top_level_tail":
		for index, node := range model.Nodes {
			nodeID := nodeIDByModelID[node.ContentID]
			if nodeID == "" {
				continue
			}
			info.Groups = append(info.Groups, SmartArtStructureGroupInfo{
				Index:      index,
				NodeIDs:    []string{nodeID},
				RootNodeID: nodeID,
			})
		}
	default:
		for index, group := range model.Groups {
			groupInfo := SmartArtStructureGroupInfo{Index: index}
			for _, contentID := range group.ContentIDs {
				if nodeID := nodeIDByModelID[contentID]; nodeID != "" {
					groupInfo.NodeIDs = append(groupInfo.NodeIDs, nodeID)
				}
			}
			if nodeID := nodeIDByModelID[group.Root.ContentID]; nodeID != "" {
				groupInfo.RootNodeID = nodeID
			}
			for _, child := range group.Children {
				if nodeID := nodeIDByModelID[child.ContentID]; nodeID != "" {
					groupInfo.ChildNodeIDs = append(groupInfo.ChildNodeIDs, nodeID)
				}
			}
			if len(groupInfo.NodeIDs) != 0 {
				info.Groups = append(info.Groups, groupInfo)
			}
		}
	}
	return info
}

func smartArtAppendBehavior(mode string) string {
	switch mode {
	case "top_level_tail":
		return "resize by changing the complete flat nodes array length by 1"
	case "list_flat_composite_tail":
		return "resize by changing the complete flat nodes array length by 1"
	case "list_group_tail":
		return "use structure_ops add_child to add only a child under a chosen parent, add_root to add only an empty parent, or resize the complete flat nodes array by 2 for the legacy combined tail behavior"
	case "list_single_root_tail":
		return "use structure_ops add_child to add only a child under the single root, add_root to add only an empty parent, or resize the complete flat nodes array by 2 for the legacy combined tail behavior"
	default:
		return ""
	}
}

func smartArtFrames(root *xmlNode) []*xmlNode {
	var result []*xmlNode
	for _, frame := range root.descendants(nsPresentation, "graphicFrame") {
		data := frame.firstDescendant(nsDrawingML, "graphicData")
		if data != nil && data.attr("", "uri") == "http://schemas.openxmlformats.org/drawingml/2006/diagram" && smartArtRelIDs(frame) != nil {
			result = append(result, frame)
		}
	}
	return result
}

func smartArtRelIDs(frame *xmlNode) *xmlNode {
	return frame.firstDescendant(nsDiagram, "relIds")
}

func smartArtNodeRefs(dataRoot, drawingRoot *xmlNode) []smartArtNodeRef {
	textShapeIDs := smartArtDrawingTextShapeIDs(drawingRoot)
	hasDrawingCache := drawingRoot != nil
	candidatesByContent := map[string][]smartArtPresCandidate{}
	presAttrs := map[string]*xmlNode{}
	for _, pt := range dataRoot.descendants(nsDiagram, "pt") {
		if pt.attr("", "type") != "pres" {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil {
			continue
		}
		contentID := prSet.attr("", "presAssocID")
		if contentID == "" {
			continue
		}
		presID := pt.attr("", "modelId")
		if presID == "" {
			continue
		}
		presAttrs[presID] = prSet
		candidatesByContent[contentID] = append(candidatesByContent[contentID], smartArtPresCandidate{
			ID:    presID,
			Index: smartArtPresStyleIndex(prSet),
			Score: smartArtPresScore(prSet, textShapeIDs[presID]),
		})
	}
	for _, cxn := range dataRoot.descendants(nsDiagram, "cxn") {
		if cxn.attr("", "type") != "presOf" {
			continue
		}
		contentID, presID := cxn.attr("", "srcId"), cxn.attr("", "destId")
		if contentID == "" || presID == "" || presAttrs[presID] == nil {
			continue
		}
		prSet := presAttrs[presID]
		candidatesByContent[contentID] = append(candidatesByContent[contentID], smartArtPresCandidate{
			ID:    presID,
			Index: smartArtPresStyleIndex(prSet),
			Score: smartArtPresScore(prSet, textShapeIDs[presID]),
		})
	}

	var nodes []smartArtNodeRef
	contentOrder := 0
	for _, pt := range dataRoot.descendants(nsDiagram, "pt") {
		modelID := pt.attr("", "modelId")
		if modelID == "" || pt.attr("", "type") != "" {
			continue
		}
		candidates := smartArtBestPresCandidates(candidatesByContent[modelID])
		if len(candidates) == 0 && !hasDrawingCache {
			candidates = smartArtFallbackPresCandidates(candidatesByContent[modelID])
		}
		if len(candidates) == 0 {
			if !hasDrawingCache && pt.child(nsDiagram, "t") != nil {
				nodes = append(nodes, smartArtNodeRef{
					ModelID: modelID,
					Index:   contentOrder,
					Text:    strings.Join(paragraphTexts(pt.child(nsDiagram, "t")), "\n"),
				})
			}
			contentOrder++
			continue
		}
		index := contentOrder
		if candidates[0].Index >= 0 {
			index = candidates[0].Index
		}
		nodes = append(nodes, smartArtNodeRef{
			ModelID: modelID,
			PresIDs: smartArtCandidateIDs(candidates),
			Index:   index,
			Text:    strings.Join(paragraphTexts(pt.child(nsDiagram, "t")), "\n"),
		})
		contentOrder++
	}
	sort.SliceStable(nodes, func(i, j int) bool {
		return nodes[i].Index < nodes[j].Index
	})
	return nodes
}

func smartArtFallbackPresCandidates(candidates []smartArtPresCandidate) []smartArtPresCandidate {
	unique := make([]smartArtPresCandidate, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		if candidate.ID == "" || seen[candidate.ID] {
			continue
		}
		seen[candidate.ID] = true
		unique = append(unique, candidate)
	}
	sort.SliceStable(unique, func(i, j int) bool {
		if unique[i].Index != unique[j].Index {
			return unique[i].Index < unique[j].Index
		}
		return unique[i].ID < unique[j].ID
	})
	return unique
}

func smartArtDrawingTextShapeIDs(root *xmlNode) map[string]bool {
	result := map[string]bool{}
	if root == nil {
		return result
	}
	for _, shape := range root.descendants(nsDiagram2008, "sp") {
		modelID := shape.attr("", "modelId")
		if modelID != "" && shape.child(nsDiagram2008, "txBody") != nil {
			result[modelID] = true
		}
	}
	return result
}

func smartArtPresStyleIndex(prSet *xmlNode) int {
	raw := prSet.attr("", "presStyleIdx")
	value, err := strconv.Atoi(raw)
	if err != nil {
		return -1
	}
	return value
}

func smartArtPresScore(prSet *xmlNode, hasDrawingText bool) int {
	score := 0
	if hasDrawingText {
		score += 100
	}
	presName := prSet.attr("", "presName")
	styleLabel := prSet.attr("", "presStyleLbl")
	if styleLabel == "node1" {
		score += 60
	}
	if presName == "node" {
		score += 50
	}
	if strings.HasSuffix(presName, "Tx") || strings.Contains(strings.ToLower(presName), "text") {
		score += 25
	}
	lowerName := strings.ToLower(presName)
	lowerLabel := strings.ToLower(styleLabel)
	if strings.Contains(lowerName, "dummy") || strings.Contains(lowerName, "space") ||
		strings.Contains(lowerName, "arrow") || strings.Contains(lowerName, "trans") {
		score -= 80
	}
	if strings.Contains(lowerLabel, "revtx") || strings.Contains(lowerLabel, "trans") {
		score -= 40
	}
	return score
}

func smartArtBestPresCandidates(candidates []smartArtPresCandidate) []smartArtPresCandidate {
	if len(candidates) == 0 {
		return nil
	}
	unique := make([]smartArtPresCandidate, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		if candidate.ID == "" || seen[candidate.ID] {
			continue
		}
		seen[candidate.ID] = true
		unique = append(unique, candidate)
	}
	sort.SliceStable(unique, func(i, j int) bool {
		if unique[i].Score != unique[j].Score {
			return unique[i].Score > unique[j].Score
		}
		return unique[i].Index < unique[j].Index
	})
	if len(unique) == 0 || unique[0].Score <= 0 {
		return nil
	}
	bestScore := unique[0].Score
	var result []smartArtPresCandidate
	for _, candidate := range unique {
		if candidate.Score != bestScore {
			break
		}
		result = append(result, candidate)
	}
	return result
}

func smartArtCandidateIDs(candidates []smartArtPresCandidate) []string {
	result := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		result = append(result, candidate.ID)
	}
	return result
}

func checkSmartArts(report *CheckReport, planIndex int, slide *SlideLibraryItem, edits []SmartArtEdit) {
	for _, edit := range edits {
		smartArt, selector := findSmartArt(slide, edit)
		if smartArt == nil {
			if !edit.Optional {
				addCheck(report, "ERROR", CheckResult{
					"plan_slide": planIndex, "source_slide": slide.SlideIndex, "selector": selector,
					"message": "SmartArt target not found in slide library",
				})
			}
			continue
		}
		if !smartArt.Editable {
			addCheck(report, "ERROR", CheckResult{
				"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
				"message": "SmartArt is not editable: " + smartArt.Reason,
			})
			continue
		}
		if edit.Resize {
			if !smartArt.Resizable {
				addCheck(report, "ERROR", CheckResult{
					"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
					"message": "SmartArt node count is not editable: " + smartArt.ResizeReason,
				})
				continue
			}
			if len(edit.Nodes) == 0 || len(edit.Nodes) > 20 {
				addCheck(report, "ERROR", CheckResult{
					"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
					"message": "SmartArt resize needs 1 to 20 nodes",
				})
				continue
			}
			countChanges := len(edit.Nodes) != len(smartArt.Nodes)
			for index, node := range edit.Nodes {
				if countChanges && node.NodeID != "" {
					addCheck(report, "ERROR", CheckResult{
						"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
						"node_id": node.NodeID, "message": "SmartArt resize with node count changes must use array order",
					})
					continue
				}
				if node.NodeID != "" && smartArtNodeByEdit(smartArt, node, index) == nil {
					addCheck(report, "ERROR", CheckResult{
						"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
						"node_id": node.NodeID, "message": "SmartArt node target not found",
					})
					continue
				}
				addCheck(report, "OK", CheckResult{
					"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
					"message": "SmartArt resize node is valid",
				})
			}
			continue
		}
		for _, op := range edit.StructureOps {
			if smartArt.Structure == nil {
				if !op.Optional {
					addCheck(report, "ERROR", CheckResult{
						"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
						"message": "SmartArt structure operation requires a resizable structured SmartArt",
					})
				}
				continue
			}
			switch op.Op {
			case "add_child":
				if smartArtStructureGroupByRootNodeID(smartArt.Structure, op.ParentNodeID) == nil {
					if !op.Optional {
						addCheck(report, "ERROR", CheckResult{
							"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
							"node_id": op.ParentNodeID, "message": "SmartArt parent node target not found",
						})
					}
					continue
				}
			case "add_root":
			default:
				if !op.Optional {
					addCheck(report, "ERROR", CheckResult{
						"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
						"message": "Unsupported SmartArt structure operation: " + op.Op,
					})
				}
				continue
			}
			addCheck(report, "OK", CheckResult{
				"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
				"message": "SmartArt structure operation is valid",
			})
		}
		for index, node := range edit.Nodes {
			target := smartArtNodeByEdit(smartArt, node, index)
			if target == nil {
				if !node.Optional {
					addCheck(report, "ERROR", CheckResult{
						"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
						"node_id": node.NodeID, "message": "SmartArt node target not found",
					})
				}
				continue
			}
			addCheck(report, "OK", CheckResult{
				"plan_slide": planIndex, "source_slide": slide.SlideIndex, "smartart_id": smartArt.SmartArtID,
				"node_id": target.NodeID, "message": "SmartArt node target is valid",
			})
		}
	}
}

func smartArtStructureGroupByRootNodeID(info *SmartArtStructureInfo, nodeID string) *SmartArtStructureGroupInfo {
	if info == nil || nodeID == "" {
		return nil
	}
	for index := range info.Groups {
		if info.Groups[index].RootNodeID == nodeID {
			return &info.Groups[index]
		}
	}
	return nil
}

func findSmartArt(slide *SlideLibraryItem, edit SmartArtEdit) (*SmartArtInfo, string) {
	for _, selector := range []struct{ key, value string }{{"smartart_id", edit.SmartArtID}, {"shape_id", edit.ShapeID}, {"shape_name", edit.ShapeName}} {
		if selector.value == "" {
			continue
		}
		for index := range slide.SmartArts {
			item := &slide.SmartArts[index]
			if (selector.key == "smartart_id" && item.SmartArtID == selector.value) ||
				(selector.key == "shape_id" && item.ShapeID == selector.value) ||
				(selector.key == "shape_name" && item.ShapeName == selector.value) {
				return item, selector.key + ":" + selector.value
			}
		}
		return nil, selector.key + ":" + selector.value
	}
	return nil, ""
}

func smartArtNodeByEdit(info *SmartArtInfo, edit SmartArtNodeEdit, index int) *SmartArtNodeInfo {
	if edit.NodeID != "" {
		for nodeIndex := range info.Nodes {
			if info.Nodes[nodeIndex].NodeID == edit.NodeID {
				return &info.Nodes[nodeIndex]
			}
		}
		return nil
	}
	if index >= 0 && index < len(info.Nodes) {
		return &info.Nodes[index]
	}
	return nil
}

func applySmartArtEdits(pkg *Package, slide *xmlNode, rels *Relationships, types *ContentTypes, sourceSlide int, slidePart string, edits []SmartArtEdit) error {
	if len(edits) == 0 {
		return nil
	}
	frames := smartArtFrames(slide)
	maps := map[string]*xmlNode{}
	for order, frame := range frames {
		id, name := shapeIdentity(frame, order+1)
		maps[fmt.Sprintf("smartart_id:s%02d_sa%s", sourceSlide, id)] = frame
		maps["shape_id:"+id] = frame
		if name != "" {
			maps["shape_name:"+name] = frame
		}
	}

	var missing []string
	for _, edit := range edits {
		selectors := smartArtSelectors(edit)
		var frame *xmlNode
		for _, selector := range selectors {
			if frame == nil {
				frame = maps[selector]
			}
		}
		if frame == nil {
			if !edit.Optional {
				missing = append(missing, selectorLabel(selectors))
			}
			continue
		}
		if err := applySmartArtEdit(pkg, frame, rels, types, sourceSlide, slidePart, edit); err != nil {
			return err
		}
	}
	if len(missing) != 0 {
		return fmt.Errorf("missing SmartArt target(s) on slide %d: %s", sourceSlide, strings.Join(missing, "; "))
	}
	return nil
}

func applySmartArtEdit(pkg *Package, frame *xmlNode, rels *Relationships, types *ContentTypes, sourceSlide int, slidePart string, edit SmartArtEdit) error {
	shapeID, _ := shapeIdentity(frame, 0)
	relIDs := smartArtRelIDs(frame)
	if relIDs == nil {
		return fmt.Errorf("SmartArt %s on slide %d is missing diagram relationship IDs", shapeID, sourceSlide)
	}
	dataPart, err := relatedPartByID(slidePart, rels, relIDs.attr(nsOfficeRels, "dm"), RelationshipTypeDiagramData)
	if err != nil {
		return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
	}
	dataRoot, err := pkg.xmlPart(dataPart)
	if err != nil {
		return err
	}
	if edit.Resize {
		model, reason := smartArtResizeModelFromData(dataRoot)
		if model == nil {
			return fmt.Errorf("SmartArt %s on slide %d cannot resize nodes: %s", shapeID, sourceSlide, reason)
		}
		if len(edit.Nodes) != len(model.Nodes) {
			return applySmartArtResizeEdit(pkg, rels, types, sourceSlide, slidePart, shapeID, dataPart, dataRoot, edit)
		}
	}
	if len(edit.StructureOps) != 0 {
		return applySmartArtStructureOps(pkg, rels, types, sourceSlide, slidePart, shapeID, dataPart, dataRoot, edit.StructureOps)
	}
	drawingRoot, drawingPart, err := smartArtDrawingRoot(pkg, slidePart, rels, dataRoot)
	if err != nil {
		return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
	}
	nodeRefs := smartArtNodeRefs(dataRoot, drawingRoot)
	if len(nodeRefs) == 0 {
		return fmt.Errorf("SmartArt %s on slide %d has no editable nodes", shapeID, sourceSlide)
	}

	var missing []string
	for index, nodeEdit := range edit.Nodes {
		nodeIndex := index
		if nodeEdit.NodeID != "" {
			nodeIndex = smartArtNodeIndex(sourceSlide, shapeID, nodeEdit.NodeID, len(nodeRefs))
		}
		if nodeIndex < 0 || nodeIndex >= len(nodeRefs) {
			if !nodeEdit.Optional {
				missing = append(missing, nodeEdit.NodeID)
			}
			continue
		}
		text := smartArtEditText(nodeEdit)
		ref := nodeRefs[nodeIndex]
		if !setSmartArtDataText(dataRoot, ref.ModelID, text) {
			return fmt.Errorf("SmartArt %s on slide %d: node data not found: %s", shapeID, sourceSlide, ref.ModelID)
		}
		if drawingRoot != nil {
			for _, presID := range ref.PresIDs {
				setSmartArtDrawingText(drawingRoot, presID, text)
			}
		}
	}
	if len(missing) != 0 {
		return fmt.Errorf("missing SmartArt node target(s) on slide %d: %s", sourceSlide, strings.Join(missing, "; "))
	}

	data, err := marshalXML(dataRoot)
	if err != nil {
		return err
	}
	if err := pkg.SetPart(dataPart, data); err != nil {
		return err
	}
	if drawingRoot != nil {
		data, err := marshalXML(drawingRoot)
		if err != nil {
			return err
		}
		if err := pkg.SetPart(drawingPart, data); err != nil {
			return err
		}
	}
	return nil
}

func applySmartArtStructureOps(pkg *Package, rels *Relationships, types *ContentTypes, sourceSlide int, slidePart, shapeID, dataPart string, dataRoot *xmlNode, ops []SmartArtStructureOp) error {
	model, reason := smartArtResizeModelFromData(dataRoot)
	if model == nil {
		return fmt.Errorf("SmartArt %s on slide %d cannot edit SmartArt structure: %s", shapeID, sourceSlide, reason)
	}
	drawingRoot, _, err := smartArtDrawingRoot(pkg, slidePart, rels, dataRoot)
	if err != nil {
		return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
	}
	nodeRefs := smartArtNodeRefs(dataRoot, drawingRoot)
	contentIDByNodeID := make(map[string]string, len(nodeRefs))
	for index, ref := range nodeRefs {
		contentIDByNodeID[fmt.Sprintf("s%02d_sa%s_n%02d", sourceSlide, shapeID, index+1)] = ref.ModelID
	}
	for _, op := range ops {
		var newContentID string
		var err error
		switch op.Op {
		case "add_child":
			parentContentID := contentIDByNodeID[op.ParentNodeID]
			if parentContentID == "" {
				if op.Optional {
					continue
				}
				return fmt.Errorf("SmartArt %s on slide %d: parent node target not found: %s", shapeID, sourceSlide, op.ParentNodeID)
			}
			newContentID, err = appendSmartArtChildToParent(dataRoot, model, parentContentID)
		case "add_root":
			newContentID, err = appendSmartArtRootOnly(dataRoot, model)
		default:
			if op.Optional {
				continue
			}
			return fmt.Errorf("SmartArt %s on slide %d: unsupported SmartArt structure operation: %s", shapeID, sourceSlide, op.Op)
		}
		if err != nil {
			if op.Optional {
				continue
			}
			return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
		}
		if newContentID != "" && !setSmartArtDataText(dataRoot, newContentID, smartArtStructureOpText(op)) {
			return fmt.Errorf("SmartArt %s on slide %d: node data not found: %s", shapeID, sourceSlide, newContentID)
		}
		model, reason = smartArtResizeModelFromData(dataRoot)
		if model == nil {
			return fmt.Errorf("SmartArt %s on slide %d cannot edit SmartArt structure: %s", shapeID, sourceSlide, reason)
		}
	}
	if err := removeSmartArtDrawingCache(pkg, rels, types, slidePart, dataRoot); err != nil {
		return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
	}
	data, err := marshalXML(dataRoot)
	if err != nil {
		return err
	}
	return pkg.SetPart(dataPart, data)
}

func applySmartArtResizeEdit(pkg *Package, rels *Relationships, types *ContentTypes, sourceSlide int, slidePart, shapeID, dataPart string, dataRoot *xmlNode, edit SmartArtEdit) error {
	if len(edit.Nodes) == 0 || len(edit.Nodes) > 20 {
		return fmt.Errorf("SmartArt %s on slide %d resize needs 1 to 20 nodes", shapeID, sourceSlide)
	}
	for _, node := range edit.Nodes {
		if node.NodeID != "" {
			return fmt.Errorf("SmartArt %s on slide %d resize with node count changes must use array order", shapeID, sourceSlide)
		}
	}
	model, reason := smartArtResizeModelFromData(dataRoot)
	if model == nil {
		return fmt.Errorf("SmartArt %s on slide %d cannot resize nodes: %s", shapeID, sourceSlide, reason)
	}
	resizeDelta := len(edit.Nodes) - len(model.Nodes)
	if model.ResizeStep <= 0 || len(edit.Nodes) < model.FixedNodes || (resizeDelta != 0 && absInt(resizeDelta)%model.ResizeStep != 0) {
		return fmt.Errorf("SmartArt %s on slide %d resize needs a complete %s node group", shapeID, sourceSlide, model.Mode)
	}
	for len(model.Nodes) < len(edit.Nodes) {
		if err := appendSmartArtResizeGroup(dataRoot, model); err != nil {
			return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
		}
		model, reason = smartArtResizeModelFromData(dataRoot)
		if model == nil {
			return fmt.Errorf("SmartArt %s on slide %d cannot resize nodes: %s", shapeID, sourceSlide, reason)
		}
	}
	for len(model.Nodes) > len(edit.Nodes) {
		if err := deleteSmartArtResizeTailGroup(dataRoot, model); err != nil {
			return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
		}
		model, reason = smartArtResizeModelFromData(dataRoot)
		if model == nil {
			return fmt.Errorf("SmartArt %s on slide %d cannot resize nodes: %s", shapeID, sourceSlide, reason)
		}
	}
	for index, nodeEdit := range edit.Nodes {
		if !setSmartArtDataText(dataRoot, model.Nodes[index].ContentID, smartArtEditText(nodeEdit)) {
			return fmt.Errorf("SmartArt %s on slide %d: node data not found: %s", shapeID, sourceSlide, model.Nodes[index].ContentID)
		}
	}
	if err := removeSmartArtDrawingCache(pkg, rels, types, slidePart, dataRoot); err != nil {
		return fmt.Errorf("SmartArt %s on slide %d: %w", shapeID, sourceSlide, err)
	}
	data, err := marshalXML(dataRoot)
	if err != nil {
		return err
	}
	return pkg.SetPart(dataPart, data)
}

func smartArtResizeModelFromData(dataRoot *xmlNode) (*smartArtResizeModel, string) {
	if model, reason := topLevelTailSmartArtResizeModelFromData(dataRoot); model != nil {
		return model, ""
	} else if reason == "diagram point list or connection list is missing" {
		return nil, reason
	}
	if model, reason := genericListSmartArtResizeModelFromData(dataRoot, "list_flat_composite_tail"); model != nil {
		return model, ""
	} else if reason == "diagram point list or connection list is missing" || reason == "diagram root nodes are missing" {
		return nil, reason
	}
	if model, reason := genericListSmartArtResizeModelFromData(dataRoot, "list_group_tail"); model != nil {
		return model, ""
	} else if reason == "diagram point list or connection list is missing" || reason == "diagram root nodes are missing" {
		return nil, reason
	}
	if model, reason := genericListSmartArtResizeModelFromData(dataRoot, "list_single_root_tail"); model != nil {
		return model, ""
	} else {
		return nil, reason
	}
}

func topLevelTailSmartArtResizeModelFromData(dataRoot *xmlNode) (*smartArtResizeModel, string) {
	ptList := dataRoot.child(nsDiagram, "ptLst")
	cxnList := dataRoot.child(nsDiagram, "cxnLst")
	if ptList == nil || cxnList == nil {
		return nil, "diagram point list or connection list is missing"
	}

	points := map[string]*xmlNode{}
	var docID, diagramPresID string
	presNodes := map[string]*xmlNode{}
	presSibTrans := map[string]*xmlNode{}
	for _, pt := range ptList.children(nsDiagram, "pt") {
		id := pt.attr("", "modelId")
		if id == "" {
			continue
		}
		points[id] = pt
		if pt.attr("", "type") == "doc" {
			docID = id
			continue
		}
		if pt.attr("", "type") != "pres" {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil {
			continue
		}
		switch prSet.attr("", "presName") {
		case "diagram":
			if prSet.attr("", "presAssocID") == docID || docID == "" {
				diagramPresID = id
			}
		case "node":
			presNodes[prSet.attr("", "presAssocID")] = pt
		case "sibTrans":
			presSibTrans[prSet.attr("", "presAssocID")] = pt
		}
	}
	if docID == "" || diagramPresID == "" {
		return nil, "diagram root nodes are missing"
	}

	var normalCxns []*xmlNode
	presOf := map[string]*xmlNode{}
	nodePresParOf := map[string]*xmlNode{}
	sibTransPresParOf := map[string]*xmlNode{}
	for _, cxn := range cxnList.children(nsDiagram, "cxn") {
		switch cxn.attr("", "type") {
		case "":
			if cxn.attr("", "srcId") == docID {
				normalCxns = append(normalCxns, cxn)
			}
		case "presOf":
			presOf[cxn.attr("", "srcId")] = cxn
		case "presParOf":
			if cxn.attr("", "srcId") != diagramPresID {
				continue
			}
			destID := cxn.attr("", "destId")
			for assocID, presPt := range presNodes {
				if presPt.attr("", "modelId") == destID {
					nodePresParOf[assocID] = cxn
					break
				}
			}
			for assocID, presPt := range presSibTrans {
				if presPt.attr("", "modelId") == destID {
					sibTransPresParOf[assocID] = cxn
					break
				}
			}
		}
	}
	sort.SliceStable(normalCxns, func(i, j int) bool {
		return smartArtIntAttr(normalCxns[i], "srcOrd") < smartArtIntAttr(normalCxns[j], "srcOrd")
	})
	if len(normalCxns) < 2 {
		return nil, "at least two top-level SmartArt nodes are required for tail resize"
	}

	model := &smartArtResizeModel{PtList: ptList, CxnList: cxnList, DocID: docID, DiagramPresID: diagramPresID, Mode: "top_level_tail", GroupNodes: 1, ResizeStep: 1}
	seenContent := map[string]bool{}
	for index, cxn := range normalCxns {
		if smartArtIntAttr(cxn, "srcOrd") != index {
			return nil, "top-level node order is not contiguous"
		}
		contentID := cxn.attr("", "destId")
		parTransID := cxn.attr("", "parTransId")
		sibTransID := cxn.attr("", "sibTransId")
		presNodePt := presNodes[contentID]
		presOfCxn := presOf[contentID]
		if contentID == "" || parTransID == "" || sibTransID == "" || seenContent[contentID] ||
			points[contentID] == nil || points[parTransID] == nil || points[sibTransID] == nil ||
			presNodePt == nil || presOfCxn == nil || nodePresParOf[contentID] == nil {
			return nil, "top-level node mapping is incomplete"
		}
		if points[parTransID].attr("", "type") != "parTrans" || points[sibTransID].attr("", "type") != "sibTrans" {
			return nil, "transition node mapping is incomplete"
		}
		if index < len(normalCxns)-1 && (presSibTrans[sibTransID] == nil || sibTransPresParOf[sibTransID] == nil) {
			return nil, "visible sibling transition mapping is incomplete"
		}
		if index == len(normalCxns)-1 && presSibTrans[sibTransID] != nil {
			return nil, "last sibling transition is already visible"
		}
		seenContent[contentID] = true
		model.Nodes = append(model.Nodes, smartArtResizeNode{
			ContentID: contentID, ParTransID: parTransID, SibTransID: sibTransID, CxnID: cxn.attr("", "modelId"),
			PresNodeID: presNodePt.attr("", "modelId"), ContentPt: points[contentID], ParTransPt: points[parTransID],
			SibTransPt: points[sibTransID], PresNodePt: presNodePt, NormalCxn: cxn, PresOfCxn: presOfCxn,
			NodePresParOf: nodePresParOf[contentID], PresSibTransID: "",
			SibTransPresParOf: sibTransPresParOf[sibTransID],
		})
		if presPt := presSibTrans[sibTransID]; presPt != nil {
			model.Nodes[len(model.Nodes)-1].PresSibTransID = presPt.attr("", "modelId")
			model.Nodes[len(model.Nodes)-1].PresSibTransPt = presPt
			model.Nodes[len(model.Nodes)-1].SibTransPresParOf = sibTransPresParOf[sibTransID]
		}
	}
	return model, ""
}

type smartArtResizeContext struct {
	PtList        *xmlNode
	CxnList       *xmlNode
	Points        map[string]*xmlNode
	DocID         string
	DiagramPresID string
	NormalBySrc   map[string][]*xmlNode
	PresOfBySrc   map[string][]*xmlNode
	PresParBySrc  map[string][]*xmlNode
	PresByAssoc   map[string][]*xmlNode
}

func genericListSmartArtResizeModelFromData(dataRoot *xmlNode, mode string) (*smartArtResizeModel, string) {
	ctx, reason := smartArtResizeContextFromData(dataRoot)
	if reason != "" {
		return nil, reason
	}
	rootCxns := smartArtSortedCxns(ctx.NormalBySrc[ctx.DocID])
	if len(rootCxns) == 0 {
		return nil, "top-level SmartArt nodes are missing"
	}
	model := &smartArtResizeModel{
		PtList: ctx.PtList, CxnList: ctx.CxnList, DocID: ctx.DocID, DiagramPresID: ctx.DiagramPresID,
		Mode: mode,
	}

	switch mode {
	case "list_flat_composite_tail":
		if len(rootCxns) < 2 {
			return nil, "at least two flat SmartArt nodes are required for tail resize"
		}
		for _, cxn := range rootCxns {
			if len(ctx.NormalBySrc[cxn.attr("", "destId")]) != 0 {
				return nil, "SmartArt is not a flat list"
			}
			group := smartArtResizeGroupFromRootCxn(ctx, cxn, nil)
			if len(group.ContentIDs) != 1 {
				return nil, "flat SmartArt group mapping is incomplete"
			}
			model.Groups = append(model.Groups, group)
		}
		model.GroupNodes = 1
		model.ResizeStep = 1
	case "list_group_tail":
		if len(rootCxns) < 2 {
			return nil, "at least two SmartArt groups are required for tail resize"
		}
		hasChildTemplate := false
		for _, cxn := range rootCxns {
			children := smartArtSortedCxns(ctx.NormalBySrc[cxn.attr("", "destId")])
			if len(children) != 0 {
				hasChildTemplate = true
			}
			for _, child := range children {
				if len(ctx.NormalBySrc[child.attr("", "destId")]) != 0 {
					return nil, "nested SmartArt groups are not supported"
				}
			}
			model.Groups = append(model.Groups, smartArtResizeGroupFromRootCxn(ctx, cxn, children))
		}
		if !hasChildTemplate {
			return nil, "SmartArt child node template is missing"
		}
		model.GroupNodes = 2
		model.ResizeStep = 2
	case "list_single_root_tail":
		if len(rootCxns) != 1 {
			return nil, "SmartArt is not a single-root list"
		}
		containerID := rootCxns[0].attr("", "destId")
		children := smartArtSortedCxns(ctx.NormalBySrc[containerID])
		if len(children) < 1 {
			return nil, "single-root SmartArt list items are missing"
		}
		model.FixedNodes = 1
		model.GroupNodes = 1
		model.ResizeStep = 2
		for _, child := range children {
			if len(ctx.NormalBySrc[child.attr("", "destId")]) != 0 {
				return nil, "nested SmartArt list items are not supported"
			}
		}
		model.Groups = append(model.Groups, smartArtResizeGroupFromRootCxn(ctx, rootCxns[0], children))
	default:
		return nil, "unsupported SmartArt resize model"
	}

	if len(model.Groups) == 0 {
		return nil, "SmartArt resize groups are missing"
	}
	if model.GroupNodes == 0 {
		model.GroupNodes = len(model.Groups[0].ContentIDs)
	}
	for _, group := range model.Groups {
		if model.Mode == "list_flat_composite_tail" && len(group.ContentIDs) != model.GroupNodes {
			return nil, "SmartArt group content count is not consistent"
		}
		for _, contentID := range group.ContentIDs {
			model.Nodes = append(model.Nodes, smartArtResizeNode{ContentID: contentID, ContentPt: ctx.Points[contentID]})
		}
	}
	if len(model.Nodes) < 2 {
		return nil, "at least two editable SmartArt nodes are required for tail resize"
	}
	if model.ResizeStep == 0 {
		model.ResizeStep = model.GroupNodes
	}
	return model, ""
}

func smartArtResizeContextFromData(dataRoot *xmlNode) (*smartArtResizeContext, string) {
	ptList := dataRoot.child(nsDiagram, "ptLst")
	cxnList := dataRoot.child(nsDiagram, "cxnLst")
	if ptList == nil || cxnList == nil {
		return nil, "diagram point list or connection list is missing"
	}
	ctx := &smartArtResizeContext{
		PtList: ptList, CxnList: cxnList, Points: map[string]*xmlNode{}, NormalBySrc: map[string][]*xmlNode{},
		PresOfBySrc: map[string][]*xmlNode{}, PresParBySrc: map[string][]*xmlNode{}, PresByAssoc: map[string][]*xmlNode{},
	}
	for _, pt := range ptList.children(nsDiagram, "pt") {
		id := pt.attr("", "modelId")
		if id == "" {
			continue
		}
		ctx.Points[id] = pt
		if pt.attr("", "type") == "doc" {
			ctx.DocID = id
		}
		if pt.attr("", "type") != "pres" {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil {
			continue
		}
		assocID := prSet.attr("", "presAssocID")
		if assocID != "" {
			ctx.PresByAssoc[assocID] = append(ctx.PresByAssoc[assocID], pt)
		}
		if prSet.attr("", "presName") == "diagram" {
			ctx.DiagramPresID = id
		}
	}
	for _, cxn := range cxnList.children(nsDiagram, "cxn") {
		switch cxn.attr("", "type") {
		case "":
			ctx.NormalBySrc[cxn.attr("", "srcId")] = append(ctx.NormalBySrc[cxn.attr("", "srcId")], cxn)
		case "presOf":
			ctx.PresOfBySrc[cxn.attr("", "srcId")] = append(ctx.PresOfBySrc[cxn.attr("", "srcId")], cxn)
		case "presParOf":
			ctx.PresParBySrc[cxn.attr("", "srcId")] = append(ctx.PresParBySrc[cxn.attr("", "srcId")], cxn)
		}
	}
	if ctx.DiagramPresID == "" {
		for _, cxn := range ctx.PresOfBySrc[ctx.DocID] {
			if destID := cxn.attr("", "destId"); ctx.Points[destID] != nil && ctx.Points[destID].attr("", "type") == "pres" {
				ctx.DiagramPresID = destID
				break
			}
		}
	}
	if ctx.DocID == "" || ctx.DiagramPresID == "" {
		return nil, "diagram root nodes are missing"
	}
	return ctx, ""
}

func smartArtResizeGroupFromRootCxn(ctx *smartArtResizeContext, root *xmlNode, childCxns []*xmlNode) smartArtResizeGroup {
	group := smartArtResizeGroup{RootCxn: root, RootSibTransID: root.attr("", "sibTransId")}
	group.Root = smartArtResizeUnitFromCxn(ctx, root)
	for _, cxn := range append([]*xmlNode{root}, childCxns...) {
		contentID := cxn.attr("", "destId")
		group.ContentIDs = append(group.ContentIDs, contentID)
		group.PointIDs = append(group.PointIDs, contentID, cxn.attr("", "parTransId"), cxn.attr("", "sibTransId"))
		group.CxnIDs = append(group.CxnIDs, cxn.attr("", "modelId"))
	}
	for _, child := range childCxns {
		group.Children = append(group.Children, smartArtResizeUnitFromCxn(ctx, child))
	}
	group.PointIDs = smartArtUniqueIDs(group.PointIDs)
	group.ContentIDs = smartArtUniqueIDs(group.ContentIDs)
	group.PresIDs, group.TransitionPresIDs = smartArtPresIDsForGroup(ctx, group)
	group.CxnIDs = append(group.CxnIDs, smartArtCxnIDsForGroup(ctx, group.PresIDs, group.PointIDs)...)
	group.CxnIDs = smartArtUniqueIDs(group.CxnIDs)
	group.TransitionCxnIDs = smartArtCxnIDsForGroup(ctx, group.TransitionPresIDs, []string{group.RootSibTransID})
	return group
}

func smartArtResizeUnitFromCxn(ctx *smartArtResizeContext, cxn *xmlNode) smartArtResizeUnit {
	unit := smartArtResizeUnit{
		ContentID:  cxn.attr("", "destId"),
		NormalCxn:  cxn,
		SibTransID: cxn.attr("", "sibTransId"),
	}
	unit.PointIDs = smartArtUniqueIDs([]string{unit.ContentID, cxn.attr("", "parTransId"), cxn.attr("", "sibTransId")})
	unit.CxnIDs = smartArtUniqueIDs([]string{cxn.attr("", "modelId")})
	unit.PresIDs, unit.TransitionPresIDs = smartArtPresIDsForPointIDs(ctx, unit.PointIDs, unit.SibTransID)
	unit.CxnIDs = append(unit.CxnIDs, smartArtCxnIDsForGroup(ctx, unit.PresIDs, unit.PointIDs)...)
	unit.CxnIDs = smartArtUniqueIDs(unit.CxnIDs)
	unit.TransitionCxnIDs = smartArtCxnIDsForGroup(ctx, unit.TransitionPresIDs, []string{unit.SibTransID})
	return unit
}

func smartArtPresIDsForGroup(ctx *smartArtResizeContext, group smartArtResizeGroup) ([]string, []string) {
	return smartArtPresIDsForPointIDs(ctx, group.PointIDs, group.RootSibTransID)
}

func smartArtPresIDsForPointIDs(ctx *smartArtResizeContext, pointIDs []string, transitionSibTransID string) ([]string, []string) {
	starts := map[string]bool{}
	transitionStarts := map[string]bool{}
	for _, id := range pointIDs {
		for _, pres := range ctx.PresByAssoc[id] {
			presID := pres.attr("", "modelId")
			starts[presID] = true
			if id == transitionSibTransID {
				transitionStarts[presID] = true
			}
		}
	}
	all := smartArtCollectPresSubtree(ctx, starts)
	transitions := smartArtCollectPresSubtree(ctx, transitionStarts)
	return smartArtSortedPointIDs(ctx.PtList, all), smartArtSortedPointIDs(ctx.PtList, transitions)
}

func smartArtCollectPresSubtree(ctx *smartArtResizeContext, starts map[string]bool) map[string]bool {
	result := map[string]bool{}
	var walk func(string)
	walk = func(id string) {
		if id == "" || result[id] || ctx.Points[id] == nil {
			return
		}
		result[id] = true
		for _, cxn := range ctx.PresParBySrc[id] {
			walk(cxn.attr("", "destId"))
		}
	}
	for id := range starts {
		walk(id)
	}
	return result
}

func smartArtCxnIDsForGroup(ctx *smartArtResizeContext, presIDs, pointIDs []string) []string {
	presSet := smartArtIDSet(presIDs)
	pointSet := smartArtIDSet(pointIDs)
	var result []string
	for _, cxn := range ctx.CxnList.children(nsDiagram, "cxn") {
		id := cxn.attr("", "modelId")
		if id == "" {
			continue
		}
		switch cxn.attr("", "type") {
		case "presOf":
			if pointSet[cxn.attr("", "srcId")] || presSet[cxn.attr("", "destId")] {
				result = append(result, id)
			}
		case "presParOf":
			if presSet[cxn.attr("", "srcId")] || presSet[cxn.attr("", "destId")] {
				result = append(result, id)
			}
		}
	}
	return result
}

func appendSmartArtResizeGroup(dataRoot *xmlNode, model *smartArtResizeModel) error {
	switch model.Mode {
	case "top_level_tail":
		return appendSmartArtResizeNode(dataRoot, model)
	case "list_group_tail", "list_single_root_tail":
		return appendSmartArtPromotedTailGroup(dataRoot, model)
	default:
		return appendSmartArtClonedTailGroup(dataRoot, model)
	}
}

func appendSmartArtClonedTailGroup(dataRoot *xmlNode, model *smartArtResizeModel) error {
	if len(model.Groups) < 2 {
		return fmt.Errorf("at least two existing groups are required before append")
	}
	ctx, reason := smartArtResizeContextFromData(dataRoot)
	if reason != "" {
		return fmt.Errorf("%s", reason)
	}
	ids := smartArtModelIDs(dataRoot)
	last := model.Groups[len(model.Groups)-1]
	prev := model.Groups[len(model.Groups)-2]
	if len(prev.TransitionPresIDs) != 0 {
		if err := cloneSmartArtResizeSegment(ctx, ids, prev.TransitionPresIDs, prev.TransitionCxnIDs, map[string]string{
			prev.RootSibTransID: last.RootSibTransID,
		}, nil); err != nil {
			return err
		}
	}
	overrides := map[string]string{}
	for _, id := range append(last.PointIDs, last.PresIDs...) {
		overrides[id] = smartArtNewModelID(ids)
	}
	for _, id := range last.CxnIDs {
		overrides[id] = smartArtNewModelID(ids)
	}
	rootOrd := strconv.Itoa(len(model.Groups))
	if model.Mode == "list_single_root_tail" {
		rootOrd = strconv.Itoa(len(model.Groups))
	}
	if err := cloneSmartArtResizeSegment(ctx, ids, append(last.PointIDs, last.PresIDs...), last.CxnIDs, overrides, map[string]string{
		"rootOrd":   rootOrd,
		"rootCxnID": last.RootCxn.attr("", "modelId"),
	}); err != nil {
		return err
	}
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberGenericResizeModel(refreshed)
		if refreshed.Mode == "list_flat_composite_tail" {
			smartArtMoveNewestRootCxnBeforeFirstRootCxn(refreshed)
		}
	}
	return nil
}

func appendSmartArtPromotedTailGroup(dataRoot *xmlNode, model *smartArtResizeModel) error {
	if len(model.Groups) == 0 {
		return fmt.Errorf("SmartArt resize groups are missing")
	}
	tail := model.Groups[len(model.Groups)-1]
	if _, err := appendSmartArtChildToParent(dataRoot, model, tail.Root.ContentID); err != nil {
		return err
	}
	refreshed, reason := smartArtResizeModelFromData(dataRoot)
	if refreshed == nil {
		return fmt.Errorf("%s", reason)
	}
	if _, err := appendSmartArtRootOnly(dataRoot, refreshed); err != nil {
		return err
	}
	return nil
}

func appendSmartArtChildToParent(dataRoot *xmlNode, model *smartArtResizeModel, parentContentID string) (string, error) {
	if model.Mode != "list_group_tail" && model.Mode != "list_single_root_tail" {
		return "", fmt.Errorf("add_child is supported only for parent/child SmartArt lists")
	}
	targetIndex := -1
	for index, group := range model.Groups {
		if group.Root.ContentID == parentContentID {
			targetIndex = index
			break
		}
	}
	if targetIndex < 0 {
		return "", fmt.Errorf("add_child parent must be a root node")
	}
	ctx, reason := smartArtResizeContextFromData(dataRoot)
	if reason != "" {
		return "", fmt.Errorf("%s", reason)
	}
	ids := smartArtModelIDs(dataRoot)
	target := model.Groups[targetIndex]
	childTemplate, ok := smartArtTailChildTemplate(model.Groups)
	if !ok {
		return "", fmt.Errorf("SmartArt child node template is missing")
	}
	if sharedPresID := smartArtSharedChildTextPresID(ctx, target); sharedPresID != "" {
		newContentID, err := cloneSmartArtResizeDataUnit(ctx, ids, childTemplate, map[string]string{
			"normalSrcID": parentContentID,
			"normalOrd":   strconv.Itoa(len(target.Children)),
		})
		if err != nil {
			return "", err
		}
		if err := appendSmartArtSharedChildPresOf(ctx, ids, target, newContentID, sharedPresID); err != nil {
			return "", err
		}
		if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
			smartArtRenumberGenericResizeModel(refreshed)
		}
		return newContentID, nil
	}
	if previousChild, ok := smartArtLastChild(target); ok {
		transitionTemplate, hasTransition := smartArtVisibleTransitionTemplate(target.Children)
		if !hasTransition {
			transitionTemplate, hasTransition = smartArtVisibleTransitionTemplateForGroups(model.Groups)
		}
		if hasTransition {
			if err := cloneSmartArtResizeSegment(ctx, ids, transitionTemplate.TransitionPresIDs, transitionTemplate.TransitionCxnIDs, map[string]string{
				transitionTemplate.SibTransID: previousChild.SibTransID,
			}, nil); err != nil {
				return "", err
			}
		}
	}
	newContentID, err := cloneSmartArtResizeUnit(ctx, ids, childTemplate, map[string]string{
		"normalSrcID": parentContentID,
		"normalOrd":   strconv.Itoa(len(target.Children)),
	})
	if err != nil {
		return "", err
	}
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberGenericResizeModel(refreshed)
	}
	return newContentID, nil
}

func appendSmartArtRootOnly(dataRoot *xmlNode, model *smartArtResizeModel) (string, error) {
	if model.Mode != "list_group_tail" && model.Mode != "list_single_root_tail" {
		return "", fmt.Errorf("add_root is supported only for parent/child SmartArt lists")
	}
	if len(model.Groups) == 0 {
		return "", fmt.Errorf("SmartArt resize groups are missing")
	}
	ctx, reason := smartArtResizeContextFromData(dataRoot)
	if reason != "" {
		return "", fmt.Errorf("%s", reason)
	}
	ids := smartArtModelIDs(dataRoot)
	tail := model.Groups[len(model.Groups)-1]
	presIDs := smartArtRootOwnPresIDs(ctx, tail)
	if sharedPresID := smartArtSharedChildTextPresID(ctx, tail); sharedPresID != "" {
		presIDs = smartArtIDsExcept(presIDs, sharedPresID)
	}
	newContentID, err := cloneSmartArtResizeUnitWithPresIDs(ctx, ids, tail.Root, presIDs, map[string]string{
		"normalSrcID": model.DocID,
		"normalOrd":   strconv.Itoa(len(model.Groups)),
	})
	if err != nil {
		return "", err
	}
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberGenericResizeModel(refreshed)
	}
	return newContentID, nil
}

func deleteSmartArtResizeTailGroup(dataRoot *xmlNode, model *smartArtResizeModel) error {
	switch model.Mode {
	case "top_level_tail":
		return deleteSmartArtResizeTailNode(dataRoot, model)
	case "list_group_tail", "list_single_root_tail":
		return deleteSmartArtPromotedTailGroup(dataRoot, model)
	default:
		return deleteSmartArtClonedTailGroup(dataRoot, model)
	}
}

func deleteSmartArtClonedTailGroup(dataRoot *xmlNode, model *smartArtResizeModel) error {
	if len(model.Groups) <= 1 {
		return fmt.Errorf("SmartArt resize cannot delete the last group")
	}
	tail := model.Groups[len(model.Groups)-1]
	prev := model.Groups[len(model.Groups)-2]
	removePointIDs := smartArtIDSet(append(append([]string{}, tail.PointIDs...), tail.PresIDs...))
	for _, id := range prev.TransitionPresIDs {
		removePointIDs[id] = true
	}
	model.PtList.Children = smartArtKeepChildren(model.PtList.Children, removePointIDs)

	removeCxnIDs := smartArtIDSet(tail.CxnIDs)
	for _, id := range prev.TransitionCxnIDs {
		removeCxnIDs[id] = true
	}
	model.CxnList.Children = smartArtKeepChildren(model.CxnList.Children, removeCxnIDs)
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberGenericResizeModel(refreshed)
	}
	return nil
}

func deleteSmartArtPromotedTailGroup(dataRoot *xmlNode, model *smartArtResizeModel) error {
	if len(model.Groups) <= 1 {
		return fmt.Errorf("SmartArt resize cannot delete the last group")
	}
	tail := model.Groups[len(model.Groups)-1]
	prev := model.Groups[len(model.Groups)-2]
	if len(tail.Children) != 0 || len(prev.Children) == 0 {
		return fmt.Errorf("SmartArt promoted-tail resize can delete only a trailing empty group")
	}
	removePointIDs := smartArtIDSet(append(append([]string{}, tail.Root.PointIDs...), tail.Root.PresIDs...))
	for _, id := range prev.Children[len(prev.Children)-1].PointIDs {
		removePointIDs[id] = true
	}
	for _, id := range prev.Children[len(prev.Children)-1].PresIDs {
		removePointIDs[id] = true
	}
	if len(prev.Children) > 1 {
		for _, id := range prev.Children[len(prev.Children)-2].TransitionPresIDs {
			removePointIDs[id] = true
		}
	}
	for _, id := range prev.TransitionPresIDs {
		removePointIDs[id] = true
	}
	model.PtList.Children = smartArtKeepChildren(model.PtList.Children, removePointIDs)

	removeCxnIDs := smartArtIDSet(tail.Root.CxnIDs)
	for _, id := range prev.Children[len(prev.Children)-1].CxnIDs {
		removeCxnIDs[id] = true
	}
	if len(prev.Children) > 1 {
		for _, id := range prev.Children[len(prev.Children)-2].TransitionCxnIDs {
			removeCxnIDs[id] = true
		}
	}
	for _, id := range prev.TransitionCxnIDs {
		removeCxnIDs[id] = true
	}
	model.CxnList.Children = smartArtKeepChildren(model.CxnList.Children, removeCxnIDs)
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberGenericResizeModel(refreshed)
	}
	return nil
}

func cloneSmartArtResizeSegment(ctx *smartArtResizeContext, used map[string]bool, pointIDs, cxnIDs []string, overrides, options map[string]string) error {
	pointSet := smartArtIDSet(pointIDs)
	var normalPoints, presPoints []*xmlNode
	for _, child := range ctx.PtList.Children {
		id := child.attr("", "modelId")
		if !pointSet[id] {
			continue
		}
		clone := child.clone()
		smartArtRewriteModelRefs(clone, overrides)
		if clone.attr("", "modelId") == id {
			newID := smartArtNewModelID(used)
			overrides[id] = newID
			clone.setAttr("", "modelId", newID)
			smartArtRewriteModelRefs(clone, overrides)
		}
		if clone.attr("", "type") == "pres" {
			presPoints = append(presPoints, clone)
		} else {
			normalPoints = append(normalPoints, clone)
		}
	}
	if len(normalPoints) != 0 {
		smartArtInsertBeforeFirstPres(ctx.PtList, normalPoints...)
	}
	ctx.PtList.Children = append(ctx.PtList.Children, presPoints...)

	cxnSet := smartArtIDSet(cxnIDs)
	for _, child := range ctx.CxnList.Children {
		id := child.attr("", "modelId")
		if !cxnSet[id] {
			continue
		}
		clone := child.clone()
		oldID := id
		smartArtRewriteModelRefs(clone, overrides)
		if clone.attr("", "modelId") == id {
			newID := smartArtNewModelID(used)
			overrides[id] = newID
			clone.setAttr("", "modelId", newID)
			smartArtRewriteModelRefs(clone, overrides)
		}
		if options != nil && options["rootOrd"] != "" && oldID == options["rootCxnID"] {
			clone.setAttr("", "srcOrd", options["rootOrd"])
		}
		if options != nil && oldID == options["normalCxnID"] {
			if options["normalSrcID"] != "" {
				clone.setAttr("", "srcId", options["normalSrcID"])
			}
			if options["normalOrd"] != "" {
				clone.setAttr("", "srcOrd", options["normalOrd"])
			}
		}
		ctx.CxnList.Children = append(ctx.CxnList.Children, clone)
	}
	return nil
}

func cloneSmartArtResizeUnit(ctx *smartArtResizeContext, used map[string]bool, unit smartArtResizeUnit, options map[string]string) (string, error) {
	return cloneSmartArtResizeUnitWithPresIDs(ctx, used, unit, unit.PresIDs, options)
}

func cloneSmartArtResizeUnitWithPresIDs(ctx *smartArtResizeContext, used map[string]bool, unit smartArtResizeUnit, presIDs []string, options map[string]string) (string, error) {
	overrides := map[string]string{}
	presIDs = smartArtUniqueIDs(presIDs)
	pointIDs := append(append([]string{}, unit.PointIDs...), presIDs...)
	for _, id := range pointIDs {
		overrides[id] = smartArtNewModelID(used)
	}
	cxnIDs := []string{}
	if unit.NormalCxn != nil {
		cxnIDs = append(cxnIDs, unit.NormalCxn.attr("", "modelId"))
	}
	cxnIDs = append(cxnIDs, smartArtCxnIDsForSelectedPres(ctx, presIDs, unit.PointIDs)...)
	cxnIDs = smartArtUniqueIDs(cxnIDs)
	for _, id := range cxnIDs {
		overrides[id] = smartArtNewModelID(used)
	}
	if options == nil {
		options = map[string]string{}
	}
	options["normalCxnID"] = unit.NormalCxn.attr("", "modelId")
	if err := cloneSmartArtResizeSegment(ctx, used, pointIDs, cxnIDs, overrides, options); err != nil {
		return "", err
	}
	return overrides[unit.ContentID], nil
}

func cloneSmartArtResizeDataUnit(ctx *smartArtResizeContext, used map[string]bool, unit smartArtResizeUnit, options map[string]string) (string, error) {
	return cloneSmartArtResizeUnitWithPresIDs(ctx, used, unit, nil, options)
}

func smartArtCxnIDsForSelectedPres(ctx *smartArtResizeContext, presIDs, pointIDs []string) []string {
	presSet := smartArtIDSet(presIDs)
	pointSet := smartArtIDSet(pointIDs)
	var result []string
	for _, cxn := range ctx.CxnList.children(nsDiagram, "cxn") {
		id := cxn.attr("", "modelId")
		if id == "" {
			continue
		}
		switch cxn.attr("", "type") {
		case "presOf":
			if pointSet[cxn.attr("", "srcId")] && presSet[cxn.attr("", "destId")] {
				result = append(result, id)
			}
		case "presParOf":
			if presSet[cxn.attr("", "srcId")] && presSet[cxn.attr("", "destId")] {
				result = append(result, id)
			}
		}
	}
	return result
}

func appendSmartArtSharedChildPresOf(ctx *smartArtResizeContext, used map[string]bool, group smartArtResizeGroup, newContentID, presID string) error {
	if len(group.Children) == 0 {
		return fmt.Errorf("SmartArt shared child presentation template is missing")
	}
	var template *xmlNode
	for _, cxn := range ctx.PresOfBySrc[group.Children[0].ContentID] {
		if cxn.attr("", "destId") == presID {
			template = cxn
			break
		}
	}
	if template == nil {
		for _, cxn := range ctx.PresOfBySrc[group.Root.ContentID] {
			if cxn.attr("", "destId") == presID {
				template = cxn
				break
			}
		}
	}
	if template == nil {
		return fmt.Errorf("SmartArt shared child presentation connection is missing")
	}
	clone := template.clone()
	clone.setAttr("", "modelId", smartArtNewModelID(used))
	clone.setAttr("", "srcId", newContentID)
	clone.setAttr("", "destId", presID)
	ctx.CxnList.Children = append(ctx.CxnList.Children, clone)
	return nil
}

func smartArtSharedChildTextPresID(ctx *smartArtResizeContext, group smartArtResizeGroup) string {
	for _, presID := range group.Root.PresIDs {
		pt := ctx.Points[presID]
		if pt == nil {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil || prSet.attr("", "presAssocID") != group.Root.ContentID {
			continue
		}
		if strings.EqualFold(prSet.attr("", "presName"), "childText") {
			return presID
		}
	}
	return ""
}

func smartArtRootOwnPresIDs(ctx *smartArtResizeContext, group smartArtResizeGroup) []string {
	result := make([]string, 0, len(group.Root.PresIDs))
	for _, presID := range group.Root.PresIDs {
		pt := ctx.Points[presID]
		if pt == nil {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil {
			result = append(result, presID)
			continue
		}
		if prSet.attr("", "presAssocID") == group.Root.ContentID && !smartArtPresNameLooksLikeChild(prSet.attr("", "presName")) {
			result = append(result, presID)
		}
	}
	return result
}

func smartArtPresNameLooksLikeChild(name string) bool {
	normalized := strings.ToLower(name)
	return strings.Contains(normalized, "child") ||
		strings.Contains(normalized, "descendant")
}

func smartArtIDsExcept(ids []string, exclude string) []string {
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		if id != exclude {
			result = append(result, id)
		}
	}
	return result
}

func smartArtTailChildTemplate(groups []smartArtResizeGroup) (smartArtResizeUnit, bool) {
	for index := len(groups) - 1; index >= 0; index-- {
		if child, ok := smartArtLastChild(groups[index]); ok {
			return child, true
		}
	}
	return smartArtResizeUnit{}, false
}

func smartArtLastChild(group smartArtResizeGroup) (smartArtResizeUnit, bool) {
	if len(group.Children) == 0 {
		return smartArtResizeUnit{}, false
	}
	return group.Children[len(group.Children)-1], true
}

func smartArtVisibleTransitionTemplate(units []smartArtResizeUnit) (smartArtResizeUnit, bool) {
	for index := len(units) - 1; index >= 0; index-- {
		if len(units[index].TransitionPresIDs) != 0 {
			return units[index], true
		}
	}
	return smartArtResizeUnit{}, false
}

func smartArtVisibleTransitionTemplateForGroups(groups []smartArtResizeGroup) (smartArtResizeUnit, bool) {
	for groupIndex := len(groups) - 1; groupIndex >= 0; groupIndex-- {
		if unit, ok := smartArtVisibleTransitionTemplate(groups[groupIndex].Children); ok {
			return unit, true
		}
	}
	return smartArtResizeUnit{}, false
}

func smartArtVisibleRootTransitionTemplate(groups []smartArtResizeGroup) (smartArtResizeUnit, bool) {
	for index := len(groups) - 1; index >= 0; index-- {
		if len(groups[index].Root.TransitionPresIDs) != 0 {
			return groups[index].Root, true
		}
	}
	return smartArtResizeUnit{}, false
}

func smartArtRewriteModelRefs(node *xmlNode, ids map[string]string) {
	for index := range node.Attr {
		if replacement := ids[node.Attr[index].Value]; replacement != "" {
			node.Attr[index].Value = replacement
		}
	}
	for _, child := range node.Children {
		smartArtRewriteModelRefs(child, ids)
	}
}

func appendSmartArtResizeNode(dataRoot *xmlNode, model *smartArtResizeModel) error {
	if len(model.Nodes) < 2 {
		return fmt.Errorf("at least two existing nodes are required before append")
	}
	last := model.Nodes[len(model.Nodes)-1]
	prevVisible := model.Nodes[len(model.Nodes)-2]
	if prevVisible.PresSibTransPt == nil {
		return fmt.Errorf("visible sibling transition template is missing")
	}
	ids := smartArtModelIDs(dataRoot)
	newContentID := smartArtNewModelID(ids)
	newParID := smartArtNewModelID(ids)
	newSibID := smartArtNewModelID(ids)
	newCxnID := smartArtNewModelID(ids)
	newPresNodeID := smartArtNewModelID(ids)
	newPresOfID := smartArtNewModelID(ids)
	newPresParNodeID := smartArtNewModelID(ids)
	newPresSibID := smartArtNewModelID(ids)
	newPresParSibID := smartArtNewModelID(ids)

	newContent := last.ContentPt.clone()
	newContent.setAttr("", "modelId", newContentID)
	newPar := last.ParTransPt.clone()
	newPar.setAttr("", "modelId", newParID)
	newPar.setAttr("", "cxnId", newCxnID)
	newSib := last.SibTransPt.clone()
	newSib.setAttr("", "modelId", newSibID)
	newSib.setAttr("", "cxnId", newCxnID)
	smartArtInsertBeforeFirstPres(model.PtList, newContent, newPar, newSib)

	newPresSib := prevVisible.PresSibTransPt.clone()
	newPresSib.setAttr("", "modelId", newPresSibID)
	if prSet := newPresSib.child(nsDiagram, "prSet"); prSet != nil {
		prSet.setAttr("", "presAssocID", last.SibTransID)
		prSet.setAttr("", "presName", "sibTrans")
		prSet.setAttr("", "presStyleCnt", "0")
		prSet.removeAttr("", "presStyleLbl")
		prSet.removeAttr("", "presStyleIdx")
	}
	newPresNode := last.PresNodePt.clone()
	newPresNode.setAttr("", "modelId", newPresNodeID)
	if prSet := newPresNode.child(nsDiagram, "prSet"); prSet != nil {
		prSet.setAttr("", "presAssocID", newContentID)
	}
	model.PtList.Children = append(model.PtList.Children, newPresSib, newPresNode)

	newNormal := last.NormalCxn.clone()
	newNormal.setAttr("", "modelId", newCxnID)
	newNormal.setAttr("", "destId", newContentID)
	newNormal.setAttr("", "srcOrd", strconv.Itoa(len(model.Nodes)))
	newNormal.setAttr("", "parTransId", newParID)
	newNormal.setAttr("", "sibTransId", newSibID)
	newPresOf := last.PresOfCxn.clone()
	newPresOf.setAttr("", "modelId", newPresOfID)
	newPresOf.setAttr("", "srcId", newContentID)
	newPresOf.setAttr("", "destId", newPresNodeID)
	newSibPresParOf := last.NodePresParOf.clone()
	newSibPresParOf.setAttr("", "modelId", newPresParSibID)
	newSibPresParOf.setAttr("", "destId", newPresSibID)
	newNodePresParOf := last.NodePresParOf.clone()
	newNodePresParOf.setAttr("", "modelId", newPresParNodeID)
	newNodePresParOf.setAttr("", "destId", newPresNodeID)
	model.CxnList.Children = append(model.CxnList.Children, newNormal, newPresOf, newSibPresParOf, newNodePresParOf)
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberResizeModel(refreshed)
	}
	return nil
}

func deleteSmartArtResizeTailNode(dataRoot *xmlNode, model *smartArtResizeModel) error {
	if len(model.Nodes) <= 1 {
		return fmt.Errorf("SmartArt resize cannot delete the last node")
	}
	tail := model.Nodes[len(model.Nodes)-1]
	prev := model.Nodes[len(model.Nodes)-2]
	removeIDs := map[string]bool{
		tail.ContentID: true, tail.ParTransID: true, tail.SibTransID: true, tail.PresNodeID: true,
	}
	if prev.PresSibTransID != "" {
		removeIDs[prev.PresSibTransID] = true
	}
	model.PtList.Children = smartArtKeepChildren(model.PtList.Children, removeIDs)

	removeCxnIDs := map[string]bool{
		tail.CxnID:                             true,
		tail.PresOfCxn.attr("", "modelId"):     true,
		tail.NodePresParOf.attr("", "modelId"): true,
	}
	if prev.SibTransPresParOf != nil {
		removeCxnIDs[prev.SibTransPresParOf.attr("", "modelId")] = true
	}
	model.CxnList.Children = smartArtKeepChildren(model.CxnList.Children, removeCxnIDs)
	if refreshed, _ := smartArtResizeModelFromData(dataRoot); refreshed != nil {
		smartArtRenumberResizeModel(refreshed)
	}
	return nil
}

func removeSmartArtDrawingCache(pkg *Package, rels *Relationships, types *ContentTypes, slidePart string, dataRoot *xmlNode) error {
	ext := dataRoot.firstDescendant(nsDiagram2008, "dataModelExt")
	if ext == nil || ext.attr("", "relId") == "" {
		return nil
	}
	relID := ext.attr("", "relId")
	drawingPart, err := relatedPartByID(slidePart, rels, relID, RelationshipTypeDiagramDrawing)
	if err != nil {
		return err
	}
	rels.Remove(relID)
	if err := pkg.SetRelationships(slidePart, rels); err != nil {
		return err
	}
	if pkg.HasPart(drawingPart) {
		if err := pkg.DeletePart(drawingPart); err != nil {
			return err
		}
	}
	if types != nil {
		types.RemoveOverride(drawingPart)
	}
	smartArtRemoveDescendants(dataRoot, nsDiagram2008, "dataModelExt")
	return nil
}

func smartArtRenumberResizeModel(model *smartArtResizeModel) {
	presOrder := 0
	for index := range model.Nodes {
		node := &model.Nodes[index]
		node.NormalCxn.setAttr("", "srcOrd", strconv.Itoa(index))
		if prSet := node.PresNodePt.child(nsDiagram, "prSet"); prSet != nil {
			prSet.setAttr("", "presStyleIdx", strconv.Itoa(index))
			prSet.setAttr("", "presStyleCnt", strconv.Itoa(len(model.Nodes)))
		}
		node.NodePresParOf.setAttr("", "srcOrd", strconv.Itoa(presOrder))
		presOrder++
		if node.SibTransPresParOf != nil && index < len(model.Nodes)-1 {
			node.SibTransPresParOf.setAttr("", "srcOrd", strconv.Itoa(presOrder))
			presOrder++
		}
	}
}

func smartArtRenumberGenericResizeModel(model *smartArtResizeModel) {
	if model.Mode == "top_level_tail" {
		smartArtRenumberResizeModel(model)
		return
	}
	for groupIndex, group := range model.Groups {
		if group.RootCxn != nil {
			group.RootCxn.setAttr("", "srcOrd", strconv.Itoa(groupIndex))
		}
	}
	for _, cxns := range smartArtCxnGroupsBySrc(model.CxnList, "") {
		sort.SliceStable(cxns, func(i, j int) bool {
			return smartArtIntAttr(cxns[i], "srcOrd") < smartArtIntAttr(cxns[j], "srcOrd")
		})
		for index, cxn := range cxns {
			cxn.setAttr("", "srcOrd", strconv.Itoa(index))
		}
	}
	contentOrder := map[string]int{}
	for index, node := range model.Nodes {
		contentOrder[node.ContentID] = index
	}
	type presBucket struct {
		items []*xmlNode
	}
	buckets := map[string]*presBucket{}
	for _, pt := range model.PtList.children(nsDiagram, "pt") {
		if pt.attr("", "type") != "pres" {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil || prSet.attr("", "presStyleIdx") == "" || prSet.attr("", "presStyleCnt") == "" {
			continue
		}
		assocID := prSet.attr("", "presAssocID")
		if _, ok := contentOrder[assocID]; !ok {
			continue
		}
		key := prSet.attr("", "presName")
		if key == "" {
			key = prSet.attr("", "presStyleLbl")
		}
		if key == "" {
			key = "pres"
		}
		if buckets[key] == nil {
			buckets[key] = &presBucket{}
		}
		buckets[key].items = append(buckets[key].items, pt)
	}
	for _, bucket := range buckets {
		sort.SliceStable(bucket.items, func(i, j int) bool {
			left := bucket.items[i].child(nsDiagram, "prSet").attr("", "presAssocID")
			right := bucket.items[j].child(nsDiagram, "prSet").attr("", "presAssocID")
			return contentOrder[left] < contentOrder[right]
		})
		for index, pt := range bucket.items {
			prSet := pt.child(nsDiagram, "prSet")
			prSet.setAttr("", "presStyleIdx", strconv.Itoa(index))
			prSet.setAttr("", "presStyleCnt", strconv.Itoa(len(bucket.items)))
		}
	}
	smartArtRenumberPresParOfByPhysicalOrder(model.CxnList)
}

func smartArtMoveNewestRootCxnBeforeFirstRootCxn(model *smartArtResizeModel) {
	var newest, first *xmlNode
	newestOrd := -1
	for _, cxn := range model.CxnList.children(nsDiagram, "cxn") {
		if cxn.attr("", "type") != "" || cxn.attr("", "srcId") != model.DocID {
			continue
		}
		ord := smartArtIntAttr(cxn, "srcOrd")
		if ord == 0 {
			first = cxn
		}
		if ord > newestOrd {
			newestOrd = ord
			newest = cxn
		}
	}
	if newest == nil || first == nil || newest == first {
		return
	}
	model.CxnList.Children = smartArtMoveChildBefore(model.CxnList.Children, newest, first)
}

func smartArtRenumberPresParOfByPhysicalOrder(cxnList *xmlNode) {
	nextOrdBySrc := map[string]int{}
	for _, cxn := range cxnList.children(nsDiagram, "cxn") {
		if cxn.attr("", "type") != "presParOf" {
			continue
		}
		srcID := cxn.attr("", "srcId")
		cxn.setAttr("", "srcOrd", strconv.Itoa(nextOrdBySrc[srcID]))
		nextOrdBySrc[srcID]++
	}
}

func smartArtMoveChildBefore(children []*xmlNode, moving, before *xmlNode) []*xmlNode {
	if moving == nil || before == nil || moving == before {
		return children
	}
	result := make([]*xmlNode, 0, len(children))
	for _, child := range children {
		if child == moving {
			continue
		}
		if child == before {
			result = append(result, moving)
		}
		result = append(result, child)
	}
	if len(result) == len(children)-1 {
		result = append(result, moving)
	}
	return result
}

func smartArtCxnGroupsBySrc(cxnList *xmlNode, cxnType string) map[string][]*xmlNode {
	result := map[string][]*xmlNode{}
	for _, cxn := range cxnList.children(nsDiagram, "cxn") {
		if cxn.attr("", "type") != cxnType {
			continue
		}
		result[cxn.attr("", "srcId")] = append(result[cxn.attr("", "srcId")], cxn)
	}
	return result
}

func smartArtSortedCxns(cxns []*xmlNode) []*xmlNode {
	result := append([]*xmlNode(nil), cxns...)
	sort.SliceStable(result, func(i, j int) bool {
		return smartArtIntAttr(result[i], "srcOrd") < smartArtIntAttr(result[j], "srcOrd")
	})
	return result
}

func smartArtUniqueIDs(ids []string) []string {
	seen := map[string]bool{}
	var result []string
	for _, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		result = append(result, id)
	}
	return result
}

func smartArtIDSet(ids []string) map[string]bool {
	result := map[string]bool{}
	for _, id := range ids {
		if id != "" {
			result[id] = true
		}
	}
	return result
}

func smartArtSortedPointIDs(ptList *xmlNode, ids map[string]bool) []string {
	var result []string
	for _, pt := range ptList.children(nsDiagram, "pt") {
		id := pt.attr("", "modelId")
		if ids[id] {
			result = append(result, id)
		}
	}
	return result
}

func smartArtInsertBeforeFirstPres(ptList *xmlNode, nodes ...*xmlNode) {
	insertAt := len(ptList.Children)
	for index, child := range ptList.Children {
		if child.Name.Space == nsDiagram && child.Name.Local == "pt" && child.attr("", "type") == "pres" {
			insertAt = index
			break
		}
	}
	updated := make([]*xmlNode, 0, len(ptList.Children)+len(nodes))
	updated = append(updated, ptList.Children[:insertAt]...)
	updated = append(updated, nodes...)
	updated = append(updated, ptList.Children[insertAt:]...)
	ptList.Children = updated
}

func smartArtKeepChildren(children []*xmlNode, removeIDs map[string]bool) []*xmlNode {
	kept := children[:0]
	for _, child := range children {
		if removeIDs[child.attr("", "modelId")] {
			continue
		}
		kept = append(kept, child)
	}
	return kept
}

func smartArtRemoveDescendants(root *xmlNode, space, local string) {
	kept := root.Children[:0]
	for _, child := range root.Children {
		if child.Name.Space == space && child.Name.Local == local {
			continue
		}
		smartArtRemoveDescendants(child, space, local)
		kept = append(kept, child)
	}
	root.Children = kept
}

func smartArtModelIDs(root *xmlNode) map[string]bool {
	result := map[string]bool{}
	for _, node := range root.descendants(nsDiagram, "pt") {
		if id := node.attr("", "modelId"); id != "" {
			result[id] = true
		}
	}
	for _, node := range root.descendants(nsDiagram, "cxn") {
		if id := node.attr("", "modelId"); id != "" {
			result[id] = true
		}
	}
	return result
}

func smartArtNewModelID(used map[string]bool) string {
	for attempt := 0; ; attempt++ {
		id, ok := smartArtRandomModelID()
		if !ok {
			id = fmt.Sprintf("{00000000-0000-4000-8000-%012X}", len(used)+attempt)
		}
		if !used[id] {
			used[id] = true
			return id
		}
	}
}

func smartArtRandomModelID() (string, bool) {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		return "", false
	}
	data[6] = (data[6] & 0x0f) | 0x40
	data[8] = (data[8] & 0x3f) | 0x80
	return strings.ToUpper(fmt.Sprintf("{%08x-%04x-%04x-%04x-%012x}",
		data[0:4], data[4:6], data[6:8], data[8:10], data[10:16])), true
}

func smartArtIntAttr(node *xmlNode, name string) int {
	value, err := strconv.Atoi(node.attr("", name))
	if err != nil {
		return -1
	}
	return value
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func relatedPartByID(owner string, rels *Relationships, id, relType string) (string, error) {
	rel, ok := rels.Find(id)
	if !ok || rel.Type != relType || rel.Mode != TargetInternal {
		return "", fmt.Errorf("relationship %s not found", id)
	}
	partName, err := ResolveTarget(owner, rel.Target)
	if err != nil {
		return "", err
	}
	return partName, nil
}

func smartArtDrawingRoot(pkg *Package, slidePart string, rels *Relationships, dataRoot *xmlNode) (*xmlNode, string, error) {
	ext := dataRoot.firstDescendant(nsDiagram2008, "dataModelExt")
	if ext == nil || ext.attr("", "relId") == "" {
		return nil, "", nil
	}
	partName, err := relatedPartByID(slidePart, rels, ext.attr("", "relId"), RelationshipTypeDiagramDrawing)
	if err != nil {
		return nil, "", err
	}
	root, err := pkg.xmlPart(partName)
	if err != nil {
		return nil, "", err
	}
	return root, partName, nil
}

func smartArtNodeIndex(sourceSlide int, shapeID, nodeID string, count int) int {
	prefix := fmt.Sprintf("s%02d_sa%s_n", sourceSlide, shapeID)
	if !strings.HasPrefix(nodeID, prefix) {
		return -1
	}
	value, err := strconv.Atoi(strings.TrimPrefix(nodeID, prefix))
	if err != nil || value < 1 || value > count {
		return -1
	}
	return value - 1
}

func setSmartArtDataText(dataRoot *xmlNode, modelID, text string) bool {
	for _, pt := range dataRoot.descendants(nsDiagram, "pt") {
		if pt.attr("", "modelId") != modelID {
			continue
		}
		prSet := pt.child(nsDiagram, "prSet")
		if prSet == nil {
			prSet = element(nsDiagram, "prSet")
			pt.Children = append([]*xmlNode{prSet}, pt.Children...)
		}
		prSet.removeAttr("", "phldr")
		body := pt.child(nsDiagram, "t")
		if body == nil {
			body = element(nsDiagram, "t")
			pt.Children = append(pt.Children, body)
		}
		setSmartArtTextBody(body, strings.Split(text, "\n"))
		return true
	}
	return false
}

func setSmartArtDrawingText(drawingRoot *xmlNode, presID, text string) bool {
	for _, shape := range drawingRoot.descendants(nsDiagram2008, "sp") {
		if shape.attr("", "modelId") != presID {
			continue
		}
		body := shape.child(nsDiagram2008, "txBody")
		if body == nil {
			return false
		}
		setSmartArtTextBody(body, strings.Split(text, "\n"))
		return true
	}
	return false
}

func setSmartArtTextBody(body *xmlNode, lines []string) {
	if len(lines) == 0 {
		lines = []string{""}
	}
	templates := body.children(nsDrawingML, "p")
	if len(templates) == 0 {
		templates = []*xmlNode{element(nsDrawingML, "p")}
	}
	for index := range templates {
		templates[index] = templates[index].clone()
	}
	body.removeChildren(nsDrawingML, "p")
	for index, line := range lines {
		paragraph := templates[min(index, len(templates)-1)].clone()
		setParagraphText(paragraph, line)
		body.Children = append(body.Children, paragraph)
	}
}

func smartArtEditText(edit SmartArtNodeEdit) string {
	if edit.Paragraphs != nil {
		return strings.Join(edit.Paragraphs, "\n")
	}
	return edit.Text
}

func smartArtStructureOpText(op SmartArtStructureOp) string {
	if op.Paragraphs != nil {
		return strings.Join(op.Paragraphs, "\n")
	}
	return op.Text
}

func smartArtSelectors(value SmartArtEdit) []string {
	var result []string
	if value.SmartArtID != "" {
		result = append(result, "smartart_id:"+value.SmartArtID)
	}
	if value.ShapeID != "" {
		result = append(result, "shape_id:"+value.ShapeID)
	}
	if value.ShapeName != "" {
		result = append(result, "shape_name:"+value.ShapeName)
	}
	return result
}
