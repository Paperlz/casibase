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

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"

import { cn } from "~/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckState = "checked" | "unchecked" | "indeterminate"

type TreeNode = {
  key: string
  label: string
  children?: TreeNode[]
  /** Cannot be unchecked (always stays in navItems) */
  alwaysOn?: boolean
  /** Requires Casdoor to be installed */
  casdoorRequired?: boolean
}

// ── Tree definition ───────────────────────────────────────────────────────────

function buildTree(): TreeNode[] {
  return [
    {
      key: "all",
      label: i18next.t("store:All"),
      children: [
        { key: "/chat", label: i18next.t("general:Chat") },
        {
          key: "/basic",
          label: i18next.t("general:Basic"),
          children: [
            { key: "/stores", label: i18next.t("general:Stores") },
            { key: "/chats", label: i18next.t("general:Chats") },
            { key: "/messages", label: i18next.t("general:Messages") },
          ],
        },
        {
          key: "/knowledge-base",
          label: i18next.t("general:Knowledge Base"),
          children: [
            { key: "/files", label: i18next.t("general:Files") },
            { key: "/vectors", label: i18next.t("general:Vectors") },
          ],
        },
        {
          key: "/connectors",
          label: i18next.t("general:Connectors"),
          children: [
            { key: "/providers", label: i18next.t("general:Providers") },
            { key: "/pipes", label: i18next.t("general:Pipes") },
            { key: "/skills", label: i18next.t("general:Skills") },
            { key: "/tools", label: i18next.t("general:Tools") },
            { key: "/servers", label: i18next.t("general:MCP Servers") },
          ],
        },
        {
          key: "/multimedia",
          label: i18next.t("general:Multimedia"),
          children: [
            { key: "/tasks", label: i18next.t("general:Tasks") },
            { key: "/scales", label: i18next.t("general:Scales") },
          ],
        },
        {
          key: "/logs",
          label: i18next.t("general:Auditing Logs"),
          children: [
            { key: "/records", label: i18next.t("general:Logs") },
            { key: "/sessions", label: i18next.t("general:Sessions") },
          ],
        },
        {
          key: "/identity",
          label: i18next.t("general:Identity"),
          casdoorRequired: true,
          children: [
            { key: "/users", label: i18next.t("general:Users"), casdoorRequired: true },
            { key: "/permissions", label: i18next.t("general:Permissions"), casdoorRequired: true },
          ],
        },
        {
          key: "/admin",
          label: i18next.t("general:Admin"),
          children: [
            { key: "/sites", label: i18next.t("general:Sites"), alwaysOn: true },
            { key: "/resources", label: i18next.t("general:Resources") },
            { key: "/usages", label: i18next.t("general:Usages") },
            { key: "/visitors", label: i18next.t("general:Visitors") },
            { key: "/sysinfo", label: i18next.t("general:System Info") },
            { key: "/swagger", label: "Swagger" },
          ],
        },
      ],
    },
  ]
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

function getAllKeys(node: TreeNode): string[] {
  return [node.key, ...(node.children ?? []).flatMap(getAllKeys)]
}

function getLeafKeys(node: TreeNode): string[] {
  if (!node.children?.length) return [node.key]
  return node.children.flatMap(getLeafKeys)
}

function getAncestorKeys(targetKey: string, nodes: TreeNode[], acc: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.key === targetKey) return acc
    if (node.children) {
      const found = getAncestorKeys(targetKey, node.children, [...acc, node.key])
      if (found) return found
    }
  }
  return null
}

/**
 * Expand parent keys so that if "all" or "/basic" etc. is in the array,
 * all their descendant keys are also included. This normalises legacy
 * stored values like ["all"] into the full key set.
 */
function expandParentKeys(keys: string[], tree: TreeNode[]): string[] {
  const inSet = new Set(keys)
  const result = new Set<string>()

  function walk(node: TreeNode, parentSelected: boolean) {
    const selected = parentSelected || inSet.has(node.key)
    if (selected) result.add(node.key)
    for (const child of node.children ?? []) walk(child, selected)
  }

  for (const node of tree) walk(node, false)
  // Also carry over any keys that weren't in the tree (future-proof)
  for (const k of keys) result.add(k)
  return [...result]
}

function getCheckState(node: TreeNode, checkedSet: Set<string>): CheckState {
  const leaves = getLeafKeys(node)
  const n = leaves.filter((k) => checkedSet.has(k)).length
  if (n === 0) return "unchecked"
  if (n === leaves.length) return "checked"
  return "indeterminate"
}

function applyToggle(
  node: TreeNode,
  checkedKeys: string[],
  checking: boolean,
  tree: TreeNode[],
): string[] {
  // Keys that must always remain checked
  const alwaysOn = new Set<string>()
  function collectAlwaysOn(n: TreeNode) {
    if (n.alwaysOn) alwaysOn.add(n.key)
    n.children?.forEach(collectAlwaysOn)
  }
  tree.forEach(collectAlwaysOn)

  const affected = getAllKeys(node).filter((k) => !alwaysOn.has(k))

  if (checking) {
    return [...new Set([...checkedKeys, ...affected])]
  } else {
    const out = new Set(checkedKeys)
    for (const k of affected) out.delete(k)
    // Remove ancestor group-keys that are no longer fully checked
    const ancestors = getAncestorKeys(node.key, tree) ?? []
    for (const a of ancestors) out.delete(a)
    return [...out]
  }
}

// ── TreeCheckbox (native input for reliable indeterminate support) ─────────────

function TreeCheckbox({
  state,
  onChange,
  disabled,
}: {
  state: CheckState
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate"
  })

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state !== "unchecked"}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 shrink-0 cursor-pointer rounded-[3px] accent-primary disabled:cursor-not-allowed disabled:opacity-50"
    />
  )
}

// ── TreeNodeItem ──────────────────────────────────────────────────────────────

function TreeNodeItem({
  node,
  checkedKeys,
  onChange,
  level,
  treeDisabled,
  casdoorAvailable,
  tree,
}: {
  node: TreeNode
  checkedKeys: string[]
  onChange: (keys: string[]) => void
  level: number
  treeDisabled: boolean
  casdoorAvailable: boolean
  tree: TreeNode[]
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = (node.children?.length ?? 0) > 0
  const checkedSet = useMemo(() => new Set(checkedKeys), [checkedKeys])
  const state = getCheckState(node, checkedSet)
  const isAlwaysOn = !!node.alwaysOn
  const isCasdoorBlocked = !!node.casdoorRequired && !casdoorAvailable
  const isDisabled = treeDisabled || isAlwaysOn || isCasdoorBlocked

  function handleChange(checked: boolean) {
    if (treeDisabled || isAlwaysOn) return
    if (checked && isCasdoorBlocked) {
      toast.warning(i18next.t("general:Identity requires Casdoor"))
      return
    }
    onChange(applyToggle(node, checkedKeys, checked, tree))
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded px-1 py-[3px]",
          !isDisabled && "cursor-default hover:bg-muted/50",
          isCasdoorBlocked && "opacity-60",
        )}
        style={{ paddingLeft: `${level * 16 + 4}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? <ChevronDownIcon className="h-3 w-3" />
              : <ChevronRightIcon className="h-3 w-3" />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        <TreeCheckbox state={state} disabled={isDisabled} onChange={handleChange} />

        <span
          className={cn(
            "select-none text-sm",
            isDisabled && "text-muted-foreground",
          )}
          onClick={() => {
            if (!isDisabled) handleChange(state !== "checked")
          }}
        >
          {node.label}
          {isCasdoorBlocked && (
            <span className="ml-1 text-xs text-muted-foreground/70">
              ({i18next.t("general:Requires Casdoor to be installed")})
            </span>
          )}
        </span>
      </div>

      {hasChildren && expanded && (node.children ?? []).map((child) => (
        <TreeNodeItem
          key={child.key}
          node={child}
          checkedKeys={checkedKeys}
          onChange={onChange}
          level={level + 1}
          treeDisabled={treeDisabled}
          casdoorAvailable={casdoorAvailable}
          tree={tree}
        />
      ))}
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function NavItemTree({
  value,
  onChange,
  disabled = false,
  casdoorAvailable = true,
}: {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  casdoorAvailable?: boolean
}) {
  const tree = useMemo(() => buildTree(), [])

  // Normalize: expand any stored parent keys (e.g. "all") to their descendants
  const normalized = useMemo(() => expandParentKeys(value, tree), [value, tree])

  return (
    <div className="rounded-lg border border-input bg-background p-2">
      {tree.map((node) => (
        <TreeNodeItem
          key={node.key}
          node={node}
          checkedKeys={normalized}
          onChange={onChange}
          level={0}
          treeDisabled={disabled}
          casdoorAvailable={casdoorAvailable}
          tree={tree}
        />
      ))}
    </div>
  )
}
