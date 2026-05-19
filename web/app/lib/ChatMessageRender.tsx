import { marked } from "marked"
import DOMPurify from "dompurify"
import katex from "katex"
import "katex/dist/katex.min.css"
import hljs from "highlight.js"
import "highlight.js/styles/atom-one-dark-reasonable.css"

marked.setOptions({
  gfm: true,
  breaks: true,
  pedantic: false,
})

export function renderMarkdown(text: string): string {
  const rawHtml = marked(text) as string
  let cleanHtml = DOMPurify.sanitize(rawHtml)
  cleanHtml = cleanHtml.replace(/<a /g, `<a target="_blank" rel="noreferrer noopener" `)
  cleanHtml = cleanHtml.replace(/<p>/g, "<div>").replace(/<\/p>/g, "</div>")
  cleanHtml = cleanHtml.replace(/<h1>/g, "<h2>").replace(/<(h[1-6])>/g, "<$1 style='margin-top: 20px; margin-bottom: 20px'>")
  cleanHtml = cleanHtml.replace(/<(ul)>/g, "<ul style='display: flex; flex-direction: column; gap: 10px; margin-top: 10px; margin-bottom: 10px'>").replace(/<(ol)>/g, "<ol style='display: flex; flex-direction: column; gap: 0px; margin-top: 20px; margin-bottom: 20px'>")
  cleanHtml = cleanHtml.replace(/<pre>/g, "<pre style='white-space: pre-wrap; white-space: -moz-pre-wrap; word-wrap: break-word;'>")
  return cleanHtml
}

export function renderLatex(text: string): string {
  const codeBlocks: string[] = []
  const placeholder = "___CODE_BLOCK___"
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return placeholder + (codeBlocks.length - 1) + placeholder
  })

  const tryKatex = (formula: string, displayMode: boolean, fallback: string) => {
    try {
      return katex.renderToString(formula, { throwOnError: false, displayMode })
    } catch {
      return fallback
    }
  }

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, f) => tryKatex(f, true, m))
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (m, f) => tryKatex(f, true, m))
  text = text.replace(/\$([^$\n]+?)\$/g, (m, f) => tryKatex(f, false, m))
  text = text.replace(/\\\((.+?)\\\)/g, (m, f) => tryKatex(f, false, m))

  text = text.replace(
    new RegExp(placeholder + "(\\d+)" + placeholder, "g"),
    (_m, idx) => codeBlocks[parseInt(idx)]
  )
  return text
}

export function renderCode(text: string): string {
  const tempDiv = document.createElement("div")
  tempDiv.innerHTML = text
  tempDiv.querySelectorAll("pre code").forEach((block) => {
    hljs.highlightElement(block as HTMLElement)
  })
  return tempDiv.innerHTML
}

export function renderText(text: string): React.ReactNode {
  let html = renderLatex(text)
  html = renderMarkdown(html)
  html = renderCode(html)
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ display: "flex", flexDirection: "column", gap: "0px" }}
    />
  )
}

export function renderReason(text: string): React.ReactNode {
  if (!text) return null
  let html = renderLatex(text)
  html = renderMarkdown(html)
  html = renderCode(html)
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0px",
        backgroundColor: "#f8f9fa",
        borderRadius: "4px",
        fontStyle: "italic",
        color: "#505050",
      }}
    />
  )
}
