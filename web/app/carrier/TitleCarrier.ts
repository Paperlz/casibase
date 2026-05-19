import { normalizeAITitle } from "~/carrier/titleUtils"

export class TitleCarrier {
  private divider = "====="

  constructor(private needTitle: boolean) {}

  parseAnswerAndTitle(answer: string): { parsedAnswer: string; title: string } {
    if (!this.needTitle) return { parsedAnswer: answer, title: "" }
    const parts = answer.split(this.divider)
    if (parts.length < 2) return { parsedAnswer: answer, title: "" }
    return { parsedAnswer: parts[0], title: normalizeAITitle(parts[1]) }
  }
}
