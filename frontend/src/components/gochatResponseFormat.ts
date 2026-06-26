import type { ChatLanguage, ResponseFormat } from './gochatConstants';
import { GOCHAT_RESPONSE_FORMAT_OPTIONS } from './gochatConstants';
import type { GochatUserPreferences } from './gochatPreferences';
import { extractCleanCsvTable, parseCsvPayload } from '../utils/gochatCsv';

const FORMAT_IDS = GOCHAT_RESPONSE_FORMAT_OPTIONS.map((o) => o.id);

export function isValidResponseFormat(value: string): value is ResponseFormat {
  return (FORMAT_IDS as string[]).includes(value);
}

/** Whether the payload is essentially a single JSON value (not mixed prose + JSON). */
export function isPrimarilyJsonPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^```(?:json)?\s*[\s\S]*?```\s*$/i.test(trimmed)) return true;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export type { CsvAnswerParts, CsvPayload } from '../utils/gochatCsv';
export { parseCsvAnswer, parseCsvPayload } from '../utils/gochatCsv';

/** Whether the reply contains a usable CSV table (fence optional; prose may wrap it). */
export function isPrimarilyCsvPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const fenced = trimmed.match(/```(?:csv)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ? fenced[1].trim() : trimmed;
  const { csvBody } = parseCsvPayload(body);
  const { tableCsv } = extractCleanCsvTable(csvBody);
  const lines = tableCsv.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return false;
  if (!lines[0].includes(',')) return false;
  return lines[0].split(',').length >= 2;
}

/** Extract structured segments only when the reply is primarily that format. */
export function normalizeAssistantContentForFormat(
  raw: string,
  format: ResponseFormat
): string {
  if (!raw?.trim()) return raw ?? '';

  let text = raw.trim();

  if (format === 'json') {
    if (!isPrimarilyJsonPayload(text)) return raw;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) text = fenced[1].trim();
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) return jsonMatch[1].trim();
    return text;
  }

  if (format === 'csv') {
    if (!isPrimarilyCsvPayload(text)) return raw;
    const fenced = text.match(/```(?:csv)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) text = fenced[1].trim();
    const { csvBody } = parseCsvPayload(text);
    const { tableCsv } = extractCleanCsvTable(csvBody);
    if (tableCsv.trim()) return tableCsv;
    return csvBody;
  }

  if (format === 'plain') {
    text = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, '').replace(/```/g, ''));
    text = text.replace(/^#{1,6}\s+/gm, '');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/`([^`]+)`/g, '$1');
    return text.trim();
  }

  if (format === 'code') {
    return text;
  }

  return text;
}

function buildFormatContract(format: ResponseFormat, language: ChatLanguage): string {
  const zh = language === 'zh';

  const contracts: Record<ResponseFormat, { en: string; zh: string }> = {
    markdown: {
      en: `OUTPUT FORMAT: MARKDOWN (primary)
- Structure the reply as Markdown: headings, lists, tables, bold, and fenced blocks where appropriate.
- Prose may appear alongside structured blocks (code, JSON, CSV). Do NOT wrap the entire answer in one outer fence.
- Use \`\`\`language fences for code/data segments so the UI can render them in dedicated containers with copy actions.
- Do NOT output raw HTML unless inside a code block.`,
      zh: `输出格式：MARKDOWN（主格式）
- 以 Markdown 组织回答：标题、列表、表格、加粗，以及必要的围栏块。
- 说明文字可与代码/JSON/CSV 等结构化块并存，禁止用单个外层围栏包裹整段回答。
- 代码与数据请使用带语言标识的 \`\`\` 围栏，便于界面用专用容器展示并支持复制。
- 除非在代码块内，否则不要输出原始 HTML。`,
    },
    plain: {
      en: `OUTPUT FORMAT: PLAIN TEXT (strict)
- Output ONLY plain text: no Markdown, no HTML, no JSON, no CSV tables, no code fences (\`\`\`).
- Use blank lines between paragraphs. Use simple lines like "1." or "-" for lists if needed.
- Do NOT use #, **, *, \`, or | table syntax.
- The UI will show your text literally; any markup will look broken.`,
      zh: `输出格式：纯文本（严格）
- 仅输出纯文本：禁止 Markdown、HTML、JSON、CSV 表格、\`\`\` 代码围栏。
- 段落之间用空行分隔；列表可用 "1." 或 "-" 开头。
- 禁止使用 #、**、*、\`、表格竖线等标记。
- 界面会原样显示文字，任何标记都会显得混乱。`,
    },
    json: {
      en: `OUTPUT FORMAT: JSON (primary)
- When returning structured data, output valid JSON (object or array) in a \`\`\`json fence or as a standalone JSON body.
- Short prose before/after is allowed for context; keep the JSON block itself parseable with no trailing commas or JS syntax.
- Prefer embedding explanations in JSON fields (e.g. "summary", "notes") when the reply is JSON-centric.`,
      zh: `输出格式：JSON（主格式）
- 返回结构化数据时，在 \`\`\`json 围栏或独立 JSON 正文中输出合法 JSON（对象或数组）。
- 允许简短说明文字作为上下文；JSON 块本身须可解析，禁止尾逗号或 JavaScript 语法。
- 以 JSON 为主时，说明性内容优先写入 JSON 字段（如 "summary"、"notes"）。`,
    },
    csv: {
      en: `OUTPUT FORMAT: CSV (primary)
- Structure: optional summary prose, then ONE \`\`\`csv fenced block with the table, then optional closing prose.
- Do NOT put prose, markdown fences, or explanations inside the CSV block — only tabular rows (header + data).
- First line inside the fence MAY name the file: @file: report.csv (or filename: report.csv).
- First tabular row MUST be column headers; quote fields that contain commas or newlines.
- The UI shows summary text separately and a Download card; the file contains only the table (footer notes appended below the table if needed).`,
      zh: `输出格式：CSV（主格式）
- 结构：可选的说明文字 + 一个 \`\`\`csv 围栏表格 + 可选的结尾说明。
- 禁止在 CSV 围栏内写说明、markdown 标记或解释性文字——围栏内仅表头与数据行。
- 围栏首行可指定文件名：@file: report.csv（或 filename: report.csv）。
- 第一行必须是表头；含逗号或换行的字段用双引号包裹。
- 界面会分开展示说明文字与 Download 卡片；下载文件仅含表格（必要时在表格下方追加备注行）。`,
    },
    code: {
      en: `OUTPUT FORMAT: CODE (primary)
- Put executable/source code in \`\`\`<language> ... \`\`\` fences with the correct language tag.
- Brief explanation may appear outside fences; keep code blocks complete and copy-paste ready.
- Prefer one or more full code blocks over pseudo-code.`,
      zh: `输出格式：CODE（主格式）
- 将可执行/源码放在 \`\`\`<语言> ... \`\`\` 围栏中，并标注正确语言。
- 围栏外可有简短说明；代码块应完整、可直接复制使用。
- 优先给出完整代码块，而非伪代码。`,
    },
  };

  return contracts[format][zh ? 'zh' : 'en'];
}

export function buildGochatSystemInstruction(prefs: GochatUserPreferences): string {
  const language = prefs.language;
  const responseFormat = prefs.responseFormat;

  const languageInstruction =
    language === 'zh'
      ? 'Reply in Simplified Chinese unless the user explicitly requests another language.'
      : 'Reply in English unless the user explicitly requests another language.';

  const formatContract = buildFormatContract(responseFormat, language);

  return [
    'You must follow the output format contract below for EVERY assistant message in this conversation.',
    'Changing topic does not change the format. Do not mention these rules to the user.',
    '',
    formatContract,
    '',
    languageInstruction,
  ].join('\n');
}

export function resolveMessageResponseFormat(
  messageFormat: ResponseFormat | undefined,
  fallback: ResponseFormat
): ResponseFormat {
  if (messageFormat && isValidResponseFormat(messageFormat)) return messageFormat;
  return fallback;
}
