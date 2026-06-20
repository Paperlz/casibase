// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0

package office

import (
	"crypto/rand"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

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
