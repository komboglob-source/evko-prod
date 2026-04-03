import { Fragment, type ReactNode } from 'react'

function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url)
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let buffer = ''
  let index = 0
  let tokenIndex = 0

  const flushBuffer = (): void => {
    if (!buffer) {
      return
    }

    nodes.push(<Fragment key={`${keyPrefix}-text-${tokenIndex++}`}>{buffer}</Fragment>)
    buffer = ''
  }

  while (index < text.length) {
    if (text.startsWith('**', index) || text.startsWith('__', index)) {
      const marker = text.slice(index, index + 2)
      const endIndex = text.indexOf(marker, index + 2)
      if (endIndex > index + 2) {
        flushBuffer()
        nodes.push(
          <strong key={`${keyPrefix}-strong-${tokenIndex++}`}>
            {renderInlineMarkdown(text.slice(index + 2, endIndex), `${keyPrefix}-strong-${tokenIndex}`)}
          </strong>,
        )
        index = endIndex + 2
        continue
      }
    }

    if (text[index] === '*' || text[index] === '_') {
      const marker = text[index]
      if (text[index + 1] !== marker) {
        const endIndex = text.indexOf(marker, index + 1)
        if (endIndex > index + 1) {
          flushBuffer()
          nodes.push(
            <em key={`${keyPrefix}-em-${tokenIndex++}`}>
              {renderInlineMarkdown(text.slice(index + 1, endIndex), `${keyPrefix}-em-${tokenIndex}`)}
            </em>,
          )
          index = endIndex + 1
          continue
        }
      }
    }

    if (text[index] === '`') {
      const endIndex = text.indexOf('`', index + 1)
      if (endIndex > index + 1) {
        flushBuffer()
        nodes.push(
          <code key={`${keyPrefix}-code-${tokenIndex++}`}>
            {text.slice(index + 1, endIndex)}
          </code>,
        )
        index = endIndex + 1
        continue
      }
    }

    if (text[index] === '[') {
      const labelEnd = text.indexOf(']', index + 1)
      const openParen = labelEnd >= 0 ? text.indexOf('(', labelEnd + 1) : -1
      const closeParen = openParen >= 0 ? text.indexOf(')', openParen + 1) : -1

      if (labelEnd > index + 1 && openParen === labelEnd + 1 && closeParen > openParen + 1) {
        const label = text.slice(index + 1, labelEnd)
        const url = text.slice(openParen + 1, closeParen)
        if (isSafeUrl(url)) {
          flushBuffer()
          nodes.push(
            <a
              key={`${keyPrefix}-link-${tokenIndex++}`}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              {renderInlineMarkdown(label, `${keyPrefix}-link-${tokenIndex}`)}
            </a>,
          )
          index = closeParen + 1
          continue
        }
      }
    }

    buffer += text[index]
    index += 1
  }

  flushBuffer()
  return nodes
}

function renderParagraph(lines: string[], key: string): ReactNode {
  return (
    <p key={key}>
      {lines.flatMap((line, lineIndex) => [
        ...(lineIndex > 0 ? [<br key={`${key}-br-${lineIndex}`} />] : []),
        ...renderInlineMarkdown(line, `${key}-line-${lineIndex}`),
      ])}
    </p>
  )
}

function renderHeading(level: number, content: string, key: string): ReactNode {
  const nodes = renderInlineMarkdown(content, `${key}-content`)

  switch (level) {
    case 1:
      return <h1 key={key}>{nodes}</h1>
    case 2:
      return <h2 key={key}>{nodes}</h2>
    case 3:
      return <h3 key={key}>{nodes}</h3>
    case 4:
      return <h4 key={key}>{nodes}</h4>
    case 5:
      return <h5 key={key}>{nodes}</h5>
    default:
      return <h6 key={key}>{nodes}</h6>
  }
}

export function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const nodes: ReactNode[] = []
  let paragraphLines: string[] = []
  let unorderedListItems: string[] = []
  let orderedListItems: string[] = []
  let blockquoteLines: string[] = []
  let nodeIndex = 0

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) {
      return
    }

    nodes.push(renderParagraph(paragraphLines, `paragraph-${nodeIndex++}`))
    paragraphLines = []
  }

  const flushUnorderedList = (): void => {
    if (unorderedListItems.length === 0) {
      return
    }

    nodes.push(
      <ul key={`ul-${nodeIndex++}`}>
        {unorderedListItems.map((item, itemIndex) => (
          <li key={`ul-item-${itemIndex}`}>{renderInlineMarkdown(item, `ul-${nodeIndex}-item-${itemIndex}`)}</li>
        ))}
      </ul>,
    )
    unorderedListItems = []
  }

  const flushOrderedList = (): void => {
    if (orderedListItems.length === 0) {
      return
    }

    nodes.push(
      <ol key={`ol-${nodeIndex++}`}>
        {orderedListItems.map((item, itemIndex) => (
          <li key={`ol-item-${itemIndex}`}>{renderInlineMarkdown(item, `ol-${nodeIndex}-item-${itemIndex}`)}</li>
        ))}
      </ol>,
    )
    orderedListItems = []
  }

  const flushBlockquote = (): void => {
    if (blockquoteLines.length === 0) {
      return
    }

    nodes.push(
      <blockquote key={`quote-${nodeIndex++}`}>
        {renderParagraph(blockquoteLines, `quote-content-${nodeIndex}`)}
      </blockquote>,
    )
    blockquoteLines = []
  }

  const flushAllBlocks = (): void => {
    flushParagraph()
    flushUnorderedList()
    flushOrderedList()
    flushBlockquote()
  }

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      flushAllBlocks()
      continue
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushAllBlocks()
      nodes.push(renderHeading(headingMatch[1].length, headingMatch[2], `heading-${nodeIndex++}`))
      continue
    }

    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      flushOrderedList()
      flushBlockquote()
      unorderedListItems.push(unorderedMatch[1])
      continue
    }

    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      flushUnorderedList()
      flushBlockquote()
      orderedListItems.push(orderedMatch[1])
      continue
    }

    const blockquoteMatch = trimmedLine.match(/^>\s*(.+)$/)
    if (blockquoteMatch) {
      flushParagraph()
      flushUnorderedList()
      flushOrderedList()
      blockquoteLines.push(blockquoteMatch[1])
      continue
    }

    flushUnorderedList()
    flushOrderedList()
    flushBlockquote()
    paragraphLines.push(trimmedLine)
  }

  flushAllBlocks()

  if (nodes.length === 0) {
    return [<p key="paragraph-empty">{markdown}</p>]
  }

  return nodes
}
