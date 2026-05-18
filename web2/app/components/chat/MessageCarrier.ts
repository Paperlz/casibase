import { SuggestionCarrier } from "~/carrier/SuggestionCarrier"
import { TitleCarrier } from "~/carrier/TitleCarrier"
import { resolveChatTitle } from "~/carrier/titleUtils"
import type { Suggestion } from "~/backend/MessageBackend"

export type ParsedAnswer = {
  finalAnswer: string
  suggestionArray: Suggestion[]
  title: string
}

export class MessageCarrier {
  private suggestionCarrier: SuggestionCarrier
  private titleCarrier: TitleCarrier

  constructor(needTitle: boolean) {
    this.suggestionCarrier = new SuggestionCarrier()
    this.titleCarrier = new TitleCarrier(needTitle)
  }

  parseAnswerWithCarriers(answer: string, userMessage = ""): ParsedAnswer {
    const { parsedAnswer, title } = this.titleCarrier.parseAnswerAndTitle(answer)
    const { finalAnswer, suggestionArray } = this.suggestionCarrier.parseAnswerAndSuggestions(parsedAnswer)
    return {
      finalAnswer,
      suggestionArray,
      title: resolveChatTitle(title, userMessage),
    }
  }
}
