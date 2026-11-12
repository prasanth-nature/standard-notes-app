import { ContentType } from '@standardnotes/domain-core'
import { SNTag } from '../../../Syncable/Tag'
import { NotesAndFilesDisplayOptions } from '../DisplayOptions'
import { computeFiltersForDisplayOptions } from '../DisplayOptionsToFilters'
import { SearchableItem } from './SearchableItem'
import { ReferenceLookupCollection, ItemFilter, SearchQuery, SearchableDecryptedItem } from './Types'

enum MatchResult {
  None = 0,
  Title = 1,
  Text = 2,
  TitleAndText = Title + Text,
  Uuid = 5,
}

/** Search aliases let symbol and LaTeX users find the same note. */
const mathSearchGroups = [
  ['∑', '\\sum'],
  ['∏', '\\prod'],
  ['∫', '\\int'],
  ['∮', '\\oint'],
  ['×', '\\times'],
  ['÷', '\\div'],
  ['±', '\\pm'],
  ['∓', '\\mp'],
  ['√', '\\sqrt'],
  ['≤', '\\le', '\\leq'],
  ['≥', '\\ge', '\\geq'],
  ['≠', '\\ne', '\\neq'],
  ['≈', '\\approx'],
  ['≡', '\\equiv'],
  ['∼', '\\sim'],
  ['∝', '\\propto'],
  ['∞', '\\infty'],
  ['∂', '\\partial'],
  ['∇', '\\nabla'],
  ['→', '\\to', '\\rightarrow'],
  ['←', '\\leftarrow'],
  ['⇒', '\\implies', '\\Rightarrow'],
  ['↔', '\\leftrightarrow'],
  ['∀', '\\forall'],
  ['∃', '\\exists'],
  ['∈', '\\in'],
  ['∉', '\\notin'],
  ['⊂', '\\subset'],
  ['⊃', '\\supset'],
  ['∪', '\\cup'],
  ['∩', '\\cap'],
  ['∅', '\\emptyset'],
  ['·', '\\cdot'],
  ['∴', '\\therefore'],
  ['∵', '\\because'],
  ['∠', '\\angle'],
  ['⊥', '\\perp'],
  ['∥', '\\parallel'],
  ['°', '\\degree'],
  ['′', '\\prime'],
  ['Α', 'α', '\\alpha'],
  ['Β', 'β', '\\beta'],
  ['Γ', 'γ', '\\gamma'],
  ['Δ', 'δ', '\\delta'],
  ['Ε', 'ε', 'ϵ', '\\epsilon', '\\varepsilon'],
  ['Ζ', 'ζ', '\\zeta'],
  ['Η', 'η', '\\eta'],
  ['Θ', 'θ', 'ϑ', '\\theta', '\\vartheta'],
  ['Ι', 'ι', '\\iota'],
  ['Κ', 'κ', 'ϰ', '\\kappa', '\\varkappa'],
  ['Λ', 'λ', '\\lambda'],
  ['Μ', 'μ', '\\mu'],
  ['Ν', 'ν', '\\nu'],
  ['Ξ', 'ξ', '\\xi'],
  ['Ο', 'ο', '\\omicron'],
  ['Π', 'π', 'ϖ', '\\pi', '\\varpi'],
  ['Ρ', 'ρ', 'ϱ', '\\rho', '\\varrho'],
  ['Σ', 'σ', 'ς', '\\sigma', '\\varsigma'],
  ['Τ', 'τ', '\\tau'],
  ['Υ', 'υ', '\\upsilon'],
  ['Φ', 'φ', 'ϕ', '\\phi', '\\varphi'],
  ['Χ', 'χ', '\\chi'],
  ['Ψ', 'ψ', '\\psi'],
  ['Ω', 'ω', '\\omega'],
]

const mathSearchAliases = new Map<string, string[]>()
for (const group of mathSearchGroups) {
  for (const term of group) {
    mathSearchAliases.set(term, group.filter((alias) => alias !== term))
  }
}

function searchTermMatches(text: string | undefined, term: string): boolean {
  if (!text) {
    return false
  }

  const aliases = mathSearchAliases.get(term) ?? mathSearchAliases.get(term.toLowerCase()) ?? []
  return [term, ...aliases].some((candidate) => {
    const normalizedCandidate = candidate.toLowerCase()
    if (!normalizedCandidate.startsWith('\\')) {
      return text.includes(normalizedCandidate)
    }

    let index = text.indexOf(normalizedCandidate)
    while (index !== -1) {
      const nextCharacter = text[index + normalizedCandidate.length]
      if (!nextCharacter || !/[a-z]/.test(nextCharacter)) {
        return true
      }
      index = text.indexOf(normalizedCandidate, index + 1)
    }

    return false
  })
}

export function notesAndFilesMatchingOptions(
  options: NotesAndFilesDisplayOptions,
  fromItems: SearchableDecryptedItem[],
  collection: ReferenceLookupCollection,
): SearchableItem[] {
  const filters = computeFiltersForDisplayOptions(options, collection)

  return fromItems.filter((item) => {
    return itemPassesFilters(item, filters)
  })
}
export function itemPassesFilters(item: SearchableDecryptedItem, filters: ItemFilter[]) {
  for (const filter of filters) {
    if (!filter(item)) {
      return false
    }
  }
  return true
}

export function itemMatchesQuery(
  itemToMatch: SearchableDecryptedItem,
  searchQuery: SearchQuery,
  collection: ReferenceLookupCollection,
): boolean {
  const { query, includeProtectedNoteText, shouldCheckForSomeTagMatches = true, noteTitleOnly = false } = searchQuery

  if (query.length === 0) {
    return true
  }

  const itemMatch = matchResultForStringQuery(itemToMatch, query)

  if (noteTitleOnly) {
    return itemMatch === MatchResult.Title || itemMatch === MatchResult.TitleAndText
  }

  if (shouldCheckForSomeTagMatches) {
    const itemTags = collection.elementsReferencingElement(itemToMatch, ContentType.TYPES.Tag) as SNTag[]
    const tagMatches = itemTags.map((tag) => matchResultForStringQuery(tag, query))
    const someTagsMatches = tagMatches.some((match) => match !== MatchResult.None)

    if (someTagsMatches) {
      return true
    }
  }

  if (itemToMatch.protected && !includeProtectedNoteText) {
    return itemMatch === MatchResult.Title || itemMatch === MatchResult.TitleAndText
  }

  return itemMatch !== MatchResult.None
}

function matchResultForStringQuery(item: SearchableItem, searchString: string): MatchResult {
  if (searchString.length === 0) {
    return MatchResult.TitleAndText
  }

  const title = item.title?.toLowerCase()
  const text = item.text?.toLowerCase()
  const lowercaseText = searchString.toLowerCase()
  const words = searchString.split(' ')
  const quotedText = stringBetweenQuotes(lowercaseText)

  if (quotedText) {
    return (
      (title?.includes(quotedText) ? MatchResult.Title : MatchResult.None) +
      (text?.includes(quotedText) ? MatchResult.Text : MatchResult.None)
    )
  }

  if (stringIsUuid(lowercaseText)) {
    return item.uuid === lowercaseText ? MatchResult.Uuid : MatchResult.None
  }

  const matchesTitle = title && words.every((word) => searchTermMatches(title, word))

  const matchesBody = text && words.every((word) => searchTermMatches(text, word))

  return (matchesTitle ? MatchResult.Title : 0) + (matchesBody ? MatchResult.Text : 0)
}

function stringBetweenQuotes(text: string) {
  const matches = text.match(/"(.*?)"/)
  return matches ? matches[1] : null
}

function stringIsUuid(text: string) {
  const matches = text.match(/\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/)
  return matches ? true : false
}
