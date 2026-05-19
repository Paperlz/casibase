import type { Suggestion } from "~/backend/MessageBackend"

export class SuggestionCarrier {
  private divider = "|||"

  parseAnswerAndSuggestions(answer: string): { finalAnswer: string; suggestionArray: Suggestion[] } {
    const parts = answer.split(this.divider)
    const suggestionTexts = parts.slice(1)
    const suggestions: Suggestion[] = suggestionTexts.map((text) => ({ text, isHit: false }))
    return { finalAnswer: parts[0], suggestionArray: suggestions }
  }
}
