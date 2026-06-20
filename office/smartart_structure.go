// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0

package office

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
