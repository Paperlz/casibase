// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0

package office

import "sort"

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
