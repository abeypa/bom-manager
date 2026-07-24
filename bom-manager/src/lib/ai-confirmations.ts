import type { ChatMessage } from '@/store/useAIStore'

const PART_TYPE_ALIASES: Record<string, RegExp[]> = {
  electrical_bought_out: [/\belectrical_bought_out\b/i, /\belectrical bought[ -]?out\b/i, /\bEBO\b/],
  electrical_manufacture: [/\belectrical_manufacture\b/i, /\belectrical manufactur(?:e|ed|ing)\b/i, /\bEMF\b/],
  mechanical_bought_out: [/\bmechanical_bought_out\b/i, /\bmechanical bought[ -]?out\b/i, /\bMBO\b/],
  mechanical_manufacture: [/\bmechanical_manufacture\b/i, /\bmechanical manufactur(?:e|ed|ing)\b/i, /\bMMF\b/],
  pneumatic_bought_out: [/\bpneumatic_bought_out\b/i, /\bpneumatic bought[ -]?out\b/i, /\bPBO\b/],
}

function latestQuestionIndex(messages: ChatMessage[], pattern: RegExp, afterIndex = -1) {
  for (let index = messages.length - 1; index > afterIndex; index--) {
    const message = messages[index]
    if (message.role === 'assistant' && pattern.test(message.content || '')) return index
  }
  return -1
}

function latestPdfIndex(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === 'user' && message.attachments?.some(attachment => attachment.kind === 'pdf')) {
      return index
    }
  }
  return -1
}

export function hasPOAttachment(messages: ChatMessage[]) {
  return latestPdfIndex(messages) >= 0
}

export function getConfirmedPartTypes(messages: ChatMessage[]): Set<string> {
  const pdfIndex = latestPdfIndex(messages)
  if (pdfIndex < 0) return new Set()

  const questionIndex = latestQuestionIndex(
    messages,
    /(?:which|choose|select|confirm|what).{0,80}part.{0,40}(?:master\s*)?(?:table|type|category)/i,
    pdfIndex,
  )
  if (questionIndex < 0) return new Set()

  const confirmed = new Set<string>()
  for (const message of messages.slice(questionIndex + 1)) {
    if (message.role !== 'user') continue
    for (const [partType, aliases] of Object.entries(PART_TYPE_ALIASES)) {
      if (aliases.some(alias => alias.test(message.content || ''))) confirmed.add(partType)
    }
  }
  return confirmed
}

export function getConfirmedProjectIds(messages: ChatMessage[]): Set<number> {
  const questionIndex = latestQuestionIndex(
    messages,
    /(?:which|choose|select|confirm|what|target).{0,80}projects?/i,
  )
  if (questionIndex < 0) return new Set()

  const confirmed = new Set<number>()
  for (const message of messages.slice(questionIndex + 1)) {
    if (message.role !== 'user') continue
    const content = message.content || ''
    if (!/\b(?:use|selected?|confirm|choose).{0,60}projects?\b|\bprojects?.{0,30}\bid\b/i.test(content)) {
      continue
    }
    for (const match of content.matchAll(/\bid\s*[:#]?\s*(\d+)\b/gi)) {
      confirmed.add(Number(match[1]))
    }
  }
  return confirmed
}
