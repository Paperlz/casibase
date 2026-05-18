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

import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DatabaseIcon,
  Loader2Icon,
  ListIcon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "katex/dist/katex.min.css"
import "~/i18n"

import { type File as FileItem, getFile } from "~/backend/FileBackend"
import { getVectors, type Vector } from "~/backend/VectorBackend"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { renderText } from "~/lib/ChatMessageRender"

export function meta() {
  return [{ title: "File — OpenAgent" }]
}

function getFormattedSize(size: number | undefined): string {
  if (size === undefined || size === null) return "-"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function getFormattedDate(dateStr: string | undefined): string {
  if (!dateStr) return "-"
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

type Pagination = { current: number; pageSize: number }

function SegmentItem({ vector }: { vector: Vector }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card mb-4 p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Top row: index, tokens, score, status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-primary">#{vector.index}</span>
            <span className="text-sm text-muted-foreground">· {vector.tokenCount ?? 0} tokens</span>
            {(vector.score ?? 0) > 0 && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                Score: {(vector.score as number).toFixed(4)}
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-1">
            {vector.provider && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {vector.provider}
              </span>
            )}
            {vector.price !== undefined && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {vector.price} {vector.currency ?? ""}
              </span>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Enabled
        </span>
      </div>

      {/* Text content rendered as markdown */}
      <div className="mb-3 pl-9 text-sm leading-relaxed text-foreground">
        {renderText(vector.text ?? "")}
      </div>

      {/* Collapsible details */}
      <div className="pl-9">
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
          Show Data &amp; Details
        </button>
        {expanded && (
          <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
              <div>
                <span className="text-muted-foreground">UUID: </span>
                <span className="font-mono break-all">{vector.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Display Name: </span>
                <span>{vector.displayName ?? "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Owner: </span>
                <span>{vector.owner}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Store: </span>
                <span>{vector.store ?? "-"}</span>
              </div>
            </div>
            <div className="mb-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold">
                <DatabaseIcon className="h-3 w-3" />
                Vector Data ({vector.dimension} dim)
              </span>
            </div>
            <div className="max-h-28 overflow-y-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground break-all">
              [{Array.isArray(vector.data) ? vector.data.join(", ") : ""}]
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FileViewPage() {
  const { fileName } = useParams<{ fileName: string }>()
  const navigate = useNavigate()
  const listScrollRef = useRef<HTMLDivElement>(null)

  const [file, setFile] = useState<FileItem | null>(null)
  const [vectors, setVectors] = useState<Vector[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10 })

  const decodedName = fileName ? decodeURIComponent(fileName) : ""

  useEffect(() => {
    if (!decodedName) return
    loadFile(decodedName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedName])

  function loadFile(name: string) {
    setLoading(true)
    getFile("admin", name)
      .then((res) => {
        if (res.status === "ok") {
          setFile(res.data)
          loadVectors(res.data)
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        toast.error(err.message)
        setLoading(false)
      })
  }

  function loadVectors(f: FileItem) {
    const objectKey = f.name.startsWith(`${f.store}_`)
      ? f.name.substring((f.store?.length ?? 0) + 1)
      : f.name

    getVectors("admin", f.store ?? "", "", "", "file", objectKey, "index", "asc")
      .then((res) => {
        if (res.status === "ok") {
          setVectors(res.data ?? [])
        } else {
          toast.error(`${i18next.t("general:Failed to get")} vectors: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false))
  }

  function handlePageChange(page: number, pageSize?: number) {
    setPagination((p) => ({ current: page, pageSize: pageSize ?? p.pageSize }))
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { current, pageSize } = pagination
  const startIndex = (current - 1) * pageSize
  const currentVectors = vectors.slice(startIndex, startIndex + pageSize)
  const totalPages = Math.max(1, Math.ceil(vectors.length / pageSize))

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col overflow-hidden bg-muted/30">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div className="flex flex-col justify-center">
            <h1 className="text-base font-semibold leading-tight">{file?.filename || decodedName}</h1>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ListIcon className="h-3 w-3" />
              {file?.store || "Universal Store"}
            </span>
          </div>
        </div>
      </div>

      {/* Body: segments list (left 3/4) + sidebar (right 1/4) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Segments list */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Segments header + pagination */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-6 py-3">
            <h2 className="text-base font-semibold">Segments ({vectors.length})</h2>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => handlePageChange(1, Number(v ?? "10"))}
              >
                <SelectTrigger className="h-7 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["10", "20", "50", "100"].map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={current <= 1}
                onClick={() => handlePageChange(current - 1)}
              >
                {i18next.t("general:Previous")}
              </Button>
              <span className="px-1 text-xs text-muted-foreground">
                {startIndex + 1}–{Math.min(startIndex + pageSize, vectors.length)} / {vectors.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={current >= totalPages}
                onClick={() => handlePageChange(current + 1)}
              >
                {i18next.t("general:Next")}
              </Button>
            </div>
          </div>

          {/* Segments body */}
          <div
            ref={listScrollRef}
            className="flex-1 overflow-y-auto p-6"
          >
            {currentVectors.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                {i18next.t("general:No data")}
              </div>
            ) : (
              currentVectors.map((v) => <SegmentItem key={v.name} vector={v} />)
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-72 shrink-0 overflow-y-auto border-l border-border bg-background p-6 xl:w-80">
          {file && (
            <>
              {/* Documentation info */}
              <div className="mb-8">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
                  DOCUMENTATION INFO
                </h3>
                <InfoItem label="Original File Name" value={file.filename ?? "-"} />
                <InfoItem label="File Size" value={getFormattedSize(file.size)} />
                <InfoItem label="Upload Date" value={getFormattedDate(file.createdTime)} />
                <div className="mb-3">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Storage Provider
                  </div>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {file.storageProvider || "-"}
                  </span>
                </div>
              </div>

              <div className="mb-8 h-px bg-border" />

              {/* Technical specs */}
              <div>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
                  TECHNICAL SPECS
                </h3>
                <InfoItem label="Store Name" value={file.store ?? "-"} />
                <InfoItem label="Total Segments" value={`${vectors.length} items`} />
                <InfoItem label="Token Count" value={`${file.tokenCount ?? 0} tokens`} />
                <InfoItem
                  label="Vector Dimension"
                  value={vectors.length > 0 ? String(vectors[0].dimension ?? "-") : "-"}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold text-primary break-all">{value}</div>
    </div>
  )
}
