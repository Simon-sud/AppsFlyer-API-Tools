/** Normalize assistant markdown before render (lists, spacing, bullets). */
export function preprocessGochatMarkdown(content: string): string {
  if (!content) return '';

  let text = content.replace(/\r\n/g, '\n');

  // Unicode bullets → markdown list markers
  text = text.replace(/^(\s*)[•·]\s+/gm, '$1- ');

  // Collapse excessive blank lines only (keep single blank line breathing room)
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text.trim();
}

/** Whether inline markdown syntax is present (bold, links, headings, etc.). */
export function hasInlineMarkdownSyntax(text: string): boolean {
  return (
    /\*\*[^*]+\*\*/.test(text) ||
    /(?:^|\s)\*[^*\s][^*]*\*(?:\s|$)/.test(text) ||
    /\[.+?\]\(.+?\)/.test(text) ||
    /^#{1,6}\s+/m.test(text) ||
    /^>\s+/m.test(text) ||
    /`[^`]+`/.test(text)
  );
}

/** Text segments between code fences should go through markdown when they carry syntax. */
export function shouldRenderAsMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const blockPatterns = (trimmed.match(/^#{1,6}\s+|^[-*]\s+|^\d+\.\s+|^>\s+/gm) || []).length;
  if (blockPatterns > 0) return true;

  return hasInlineMarkdownSyntax(trimmed);
}
