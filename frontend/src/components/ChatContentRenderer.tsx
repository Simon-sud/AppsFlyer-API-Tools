import React, { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatBubble, ResponseFormat } from './gochatConstants';
import { GochatContentShell } from './GochatContentShell';
import { GochatCsvFileCard } from './GochatCsvFileCard';
import { GochatReasoningPanel } from './GochatReasoningPanel';
import { preprocessGochatMarkdown } from './gochatMarkdown';
import {
  isPrimarilyCsvPayload,
  isPrimarilyJsonPayload,
  normalizeAssistantContentForFormat,
  parseCsvAnswer,
  resolveMessageResponseFormat,
} from './gochatResponseFormat';
import { parseCsvPayload } from '../utils/gochatCsv';

const GOCHAT_REMARK_PLUGINS = [remarkGfm];

const CsvContentView: React.FC<{ csvText: string; showProse?: boolean }> = ({
  csvText,
  showProse = false,
}) => {
  const parts = useMemo(() => parseCsvAnswer(csvText), [csvText]);

  if (!parts.tableCsv.trim() && !parts.downloadCsv.trim()) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">No CSV data</div>;
  }

  return (
    <div className="space-y-2">
      {showProse && parts.intro.trim() ? <PlainTextRenderer text={parts.intro} /> : null}
      <GochatCsvFileCard
        filename={parts.filename}
        csvText={parts.downloadCsv}
        rowCount={parts.rowCount > 0 ? parts.rowCount : undefined}
      />
      {showProse && parts.outro.trim() ? <PlainTextRenderer text={parts.outro} /> : null}
    </div>
  );
};

// Optimized plain-text renderer
const PlainTextRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text || typeof text !== 'string') {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{text}</div>;
  }

  // Split by paragraph (double or single newline)
  const paragraphs = text.split(/\n\s*\n|\n{2,}/).filter(p => p.trim());
  
  // Process each paragraph
  const renderParagraph = (para: string, idx: number) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    // Detect list items (numbered or bullet)
    const numberedListMatch = trimmed.match(/^(\d+[.)]\s+)(.+)$/);
    const bulletListMatch = trimmed.match(/^([•\-*]\s+)(.+)$/);
    
    if (numberedListMatch) {
      const [, marker, content] = numberedListMatch;
      return (
        <div key={idx} className="flex gap-2 my-1">
          <span className="text-gray-500 dark:text-gray-400 font-medium flex-shrink-0">{marker.trim()}</span>
          <span className="flex-1 leading-normal">{content}</span>
        </div>
      );
    }
    
    if (bulletListMatch) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [, _marker, content] = bulletListMatch;
      return (
        <div key={idx} className="flex gap-2 my-1">
          <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">•</span>
          <span className="flex-1 leading-normal">{content}</span>
        </div>
      );
    }

    if (trimmed.includes('\n')) {
      const lines = trimmed.split('\n').filter(l => l.trim());
      return (
        <div key={idx} className="my-0.5 space-y-0.5">
          {lines.map((line, lineIdx) => (
            <div key={lineIdx} className="leading-snug">
              {line}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div key={idx} className="my-0.5 leading-snug">
        {trimmed}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {paragraphs.map((para, idx) => renderParagraph(para, idx))}
    </div>
  );
};

/** Code panels follow theme (white body in light mode); distinct from JSON data panels */
const GOCHAT_CODE_PANEL_TEXT =
  'gochat-code-block gochat-code-panel-text block bg-transparent font-mono text-sm leading-[1.55] [&_*]:!bg-transparent';

const GOCHAT_DATA_PANEL_TEXT =
  'gochat-code-block block bg-transparent font-mono text-xs leading-normal text-slate-800 dark:text-slate-200 [&_*]:!bg-transparent';

const resolveShellForLanguage = (
  language: string
): { label: string; variant: 'code' | 'json' } => {
  const lang = language.toLowerCase();
  if (lang === 'json') return { label: 'JSON', variant: 'json' };
  if (lang === 'csv') return { label: 'CSV', variant: 'json' };
  return { label: getLanguageDisplayName(language), variant: 'code' };
};

const CodeBlockView: React.FC<{
  language: string;
  code: string;
  isOpen?: boolean;
}> = ({ language, code, isOpen }) => {
  if (language.toLowerCase() === 'csv') {
    return <CsvContentView csvText={code} />;
  }

  const shell = resolveShellForLanguage(language);
  const textClass =
    shell.variant === 'code' ? GOCHAT_CODE_PANEL_TEXT : GOCHAT_DATA_PANEL_TEXT;

  return (
    <GochatContentShell
      label={shell.label}
      copyText={code}
      variant={shell.variant}
      copyDisabled={Boolean(isOpen) || !code.trim()}
      showStreaming={Boolean(isOpen)}
    >
      <pre className="m-0 bg-transparent p-3">
        <code className={`${textClass} language-${language}`}>
          {code}
          {isOpen ? <span className="animate-pulse text-cyan-600/90 dark:text-cyan-400/80">▋</span> : null}
        </code>
      </pre>
    </GochatContentShell>
  );
};

const GOCHAT_COMPACT_PROSE =
  'prose-p:my-1 prose-p:leading-normal prose-headings:mt-1.5 prose-headings:mb-1 prose-headings:text-[0.95rem] prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:leading-normal prose-li:p-0 prose-hr:my-1.5';

const GOCHAT_MARKDOWN_COMPONENTS = {
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  code: ({ className, children, inline, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const isBlock = !inline && Boolean(match);
    if (isBlock) {
      const lang = match![1].toLowerCase();
      const blockText = String(children).replace(/\n$/, '');
      if (lang === 'json') {
        return <JSONRenderer content={blockText} />;
      }
      if (lang === 'csv') {
        const { csvBody } = parseCsvPayload(blockText);
        if (csvBody.trim()) return <CsvContentView csvText={blockText} />;
      }
      return <CodeBlockView language={match![1]} code={blockText} />;
    }
    return (
      <code
        className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
        {...props}
      >
        {children}
      </code>
    );
  },
  ul: ({ ...props }: any) => <ul className="my-1 list-disc space-y-0.5 pl-4" {...props} />,
  ol: ({ ...props }: any) => <ol className="my-1 list-decimal space-y-0.5 pl-4" {...props} />,
  li: ({ children, ...props }: any) => (
    <li className="my-0.5 py-0 leading-normal [&>p]:my-0.5" {...props}>
      {children}
    </li>
  ),
  p: ({ children, ...props }: any) => (
    <p className="my-1 leading-normal" {...props}>
      {children}
    </p>
  ),
  a: ({ href, children, ...props }: any) => {
    const url = typeof href === 'string' ? href : '';
    return (
      <a
        href={url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto cursor-pointer text-indigo-600 underline underline-offset-2 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        onClick={(e) => {
          e.stopPropagation();
          if (!url) return;
          e.preventDefault();
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
        {...props}
      >
        {children || <span className="sr-only">Link</span>}
      </a>
    );
  },
  table: ({ ...props }: any) => (
    <div className="not-prose my-4">
      <div className="gochat-scroll-rail benchmark-scrollable overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600/60">
        <div className="gochat-scroll-content min-w-0">
          <table
            className="min-w-full divide-y divide-gray-200 bg-white dark:divide-gray-600/50 dark:bg-gray-800/90"
            {...props}
          />
        </div>
      </div>
    </div>
  ),
  thead: ({ ...props }: any) => <thead className="bg-gray-50 dark:bg-gray-700/60" {...props} />,
  th: ({ ...props }: any) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider"
      {...props}
    />
  ),
  td: ({ ...props }: any) => (
    <td
      className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-600/40"
      {...props}
    />
  ),
};

// Markdown renderer
const MarkdownRenderer: React.FC<{
  content: string;
  noBackground?: boolean;
  compact?: boolean;
}> = ({ content, noBackground = false, compact = false }) => {
  const processed = useMemo(
    () => (content && typeof content === 'string' ? preprocessGochatMarkdown(content) : ''),
    [content]
  );

  if (!content || typeof content !== 'string') {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{content}</div>;
  }

  const useCompact = compact || noBackground;
  const compactClasses = useCompact
    ? GOCHAT_COMPACT_PROSE
    : 'prose-p:leading-relaxed prose-ul:my-3 prose-ol:my-3 prose-li:my-1.5';

  const blockquoteClasses = noBackground
    ? "prose-blockquote:border-l-indigo-500 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:my-1 prose-blockquote:italic"
    : "prose-blockquote:border-l-indigo-500 prose-blockquote:bg-indigo-50/50 dark:prose-blockquote:bg-indigo-900/10 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:italic";

  return (
    <div className={`gochat-markdown prose prose-sm dark:prose-invert max-w-none select-text prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:underline prose-a:underline-offset-2 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-code:text-indigo-600 dark:prose-code:text-indigo-400 prose-code:bg-indigo-50 dark:prose-code:bg-indigo-900/20 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-gray-900 dark:prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 dark:prose-pre:border-gray-700 prose-pre:rounded-lg prose-pre:overflow-x-auto ${compactClasses} ${blockquoteClasses}`}>
      <ReactMarkdown remarkPlugins={GOCHAT_REMARK_PLUGINS} components={GOCHAT_MARKDOWN_COMPONENTS}>
        {processed}
      </ReactMarkdown>
    </div>
  );
};

// JSON renderer with syntax highlight and one-click copy
const JSONRenderer: React.FC<{ content: string }> = ({ content }) => {
  const [formattedJson, setFormattedJson] = useState<string>('');
  const [isValidJson, setIsValidJson] = useState(false);

  useEffect(() => {
    try {
      // Try parsing JSON
      const parsed = JSON.parse(content);
      setFormattedJson(JSON.stringify(parsed, null, 2));
      setIsValidJson(true);
    } catch (e) {
      // If invalid JSON, try extracting JSON portion
      const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          setFormattedJson(JSON.stringify(parsed, null, 2));
          setIsValidJson(true);
        } catch {
          setIsValidJson(false);
          setFormattedJson(content);
        }
      } else {
        setIsValidJson(false);
        setFormattedJson(content);
      }
    }
  }, [content]);

  // JSON syntax highlighting (improved)
  const jsonTokenClass = {
    string: 'text-emerald-600 dark:text-emerald-400',
    number: 'text-sky-600 dark:text-sky-400',
    keyword: 'text-violet-600 dark:text-violet-400',
    punct: 'text-slate-500 dark:text-slate-500',
    plain: 'text-slate-700 dark:text-slate-300',
  };

  const highlightJSON = (json: string): React.ReactNode[] => {
    if (!isValidJson) {
      return [<span key="0" className={jsonTokenClass.plain}>{json}</span>];
    }

    const parts: React.ReactNode[] = [];
    let key = 0;
    let inString = false;
    let currentToken = '';
    
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      const prevChar = i > 0 ? json[i - 1] : '';
      
      if (char === '"' && prevChar !== '\\') {
        if (inString) {
          // End string
          parts.push(
            <span key={key++} className={jsonTokenClass.string}>
              {currentToken + char}
            </span>
          );
          currentToken = '';
          inString = false;
        } else {
          // Start string
          if (currentToken.trim()) {
            // Flush prior token
            const trimmed = currentToken.trim();
            if (trimmed.match(/^[\d.]+$/)) {
              parts.push(<span key={key++} className={jsonTokenClass.number}>{trimmed}</span>);
            } else if (trimmed.match(/^(true|false|null)$/)) {
              parts.push(<span key={key++} className={jsonTokenClass.keyword}>{trimmed}</span>);
            } else if (trimmed.match(/^[{}[\],:]$/)) {
              parts.push(<span key={key++} className={jsonTokenClass.punct}>{trimmed}</span>);
            } else {
              parts.push(<span key={key++} className={jsonTokenClass.plain}>{trimmed}</span>);
            }
            currentToken = '';
          }
          inString = true;
          currentToken = char;
        }
      } else if (inString) {
        currentToken += char;
      } else if (char.match(/[\s\n]/)) {
        // Whitespace: flush prior token
        if (currentToken.trim()) {
          const trimmed = currentToken.trim();
          if (trimmed.match(/^[\d.]+$/)) {
            parts.push(<span key={key++} className={jsonTokenClass.number}>{trimmed}</span>);
          } else if (trimmed.match(/^(true|false|null)$/)) {
            parts.push(<span key={key++} className={jsonTokenClass.keyword}>{trimmed}</span>);
          } else if (trimmed.match(/^[{}[\],:]$/)) {
            parts.push(<span key={key++} className={jsonTokenClass.punct}>{trimmed}</span>);
          } else {
            parts.push(<span key={key++} className={jsonTokenClass.plain}>{trimmed}</span>);
          }
          currentToken = '';
        }
        parts.push(<span key={key++}>{char}</span>);
      } else {
        currentToken += char;
      }
    }
    
    // Flush final token
    if (currentToken.trim()) {
      const trimmed = currentToken.trim();
      if (trimmed.match(/^[\d.]+$/)) {
        parts.push(<span key={key++} className={jsonTokenClass.number}>{trimmed}</span>);
      } else if (trimmed.match(/^(true|false|null)$/)) {
        parts.push(<span key={key++} className={jsonTokenClass.keyword}>{trimmed}</span>);
      } else if (trimmed.match(/^[{}[\],:]$/)) {
        parts.push(<span key={key++} className={jsonTokenClass.punct}>{trimmed}</span>);
      } else {
        parts.push(<span key={key++} className={jsonTokenClass.plain}>{trimmed}</span>);
      }
    }
    
    return parts;
  };

  const copyPayload = formattedJson || content;

  return (
    <GochatContentShell
      label="JSON"
      copyText={copyPayload}
      variant="json"
      copyDisabled={!copyPayload.trim()}
    >
      <pre className="m-0 bg-transparent p-3">
        <code className={`${GOCHAT_DATA_PANEL_TEXT}`}>
          {isValidJson ? highlightJSON(formattedJson) : content}
        </code>
      </pre>
    </GochatContentShell>
  );
};

// Auto-detect programming language
const detectLanguage = (code: string): string => {
  if (!code || typeof code !== 'string') return 'text';

  const trimmedCode = code.trim();
  if (!trimmedCode) return 'text';

  // Use first lines for detection accuracy
  const lines = trimmedCode.split('\n');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _firstFewLines = lines.slice(0, 10).join('\n');
  const allCode = trimmedCode;

  // SQL first (distinct keywords)
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|EXPLAIN|DESCRIBE|SHOW)\s+/i.test(allCode) ||
      /\b(FROM|WHERE|JOIN|INNER|OUTER|LEFT|RIGHT|ON|GROUP BY|ORDER BY|HAVING|UNION|AS)\b/i.test(allCode)) {
    // Avoid false positives from other languages
    if (!/^(def|class|import|from|function|const|let|var|package|public|private)/.test(allCode)) {
      return 'sql';
    }
  }

  // Python next (distinct syntax)
  if (/^(def|class|import|from|if __name__|print\(|#!\/usr\/bin\/env python|#!\/usr\/bin\/python)/.test(allCode) ||
      (/:\s*$/.test(lines[0]) && !allCode.includes('function') && !allCode.includes('=>'))) {
    // Check Python-specific syntax
    if (/\b(if|elif|else|for|while|try|except|finally|with|as|lambda|yield|async|await)\s+/.test(allCode) ||
        /^\s*(import|from)\s+\w+/.test(allCode) ||
        /print\s*\(|__init__|self\./.test(allCode)) {
      return 'python';
    }
  }

  // JavaScript/TypeScript
  if (/^(import|export|const|let|var|function|class|interface|type|enum)\s+\w+/.test(allCode) ||
      /=>\s*\{?/.test(allCode) ||
      /require\(|module\.exports/.test(allCode)) {
    if (/\.tsx|import.*from.*react|JSX/.test(allCode)) return 'tsx';
    if (/\.ts|interface|type\s+\w+\s*=/.test(allCode)) return 'typescript';
    if (/\.jsx|import.*from.*react/.test(allCode)) return 'jsx';
    return 'javascript';
  }

  // Java
  if (/^(public|private|protected)\s+(static\s+)?(class|interface|enum)/.test(allCode) ||
      /package\s+\w+;/.test(allCode) ||
      /@Override|@Deprecated/.test(allCode)) {
    return 'java';
  }

  // C/C++
  if (/^#include\s*[<"]/.test(allCode) ||
      /^(int|void|char|float|double)\s+main\s*\(/.test(allCode) ||
      /std::|using namespace std/.test(allCode)) {
    if (/std::|using namespace|cout|cin|endl/.test(allCode)) return 'cpp';
    return 'c';
  }

  // C#
  if (/^(using|namespace|public class|\[.*\]\s*public)/.test(allCode) ||
      /Console\.(Write|Read)/.test(allCode)) {
    return 'csharp';
  }

  // PHP
  if (/^<\?php/.test(allCode) ||
      /\$[a-zA-Z_]\w*\s*=/.test(allCode) ||
      /->\w+\s*\(/.test(allCode)) {
    return 'php';
  }

  // Ruby
  if (/^(def|class|module|require|puts)\s+\w+/.test(allCode) ||
      /end\s*$/.test(allCode) ||
      /@\w+\s*=/.test(allCode)) {
    return 'ruby';
  }

  // Go
  if (/^(package|import|func|var|const|type)\s+\w+/.test(allCode) ||
      /:=/.test(allCode) ||
      /fmt\.(Print|Scan)/.test(allCode)) {
    return 'go';
  }

  // Rust
  if (/^(fn|let|mut|pub|struct|enum|impl|use)\s+\w+/.test(allCode) ||
      /!\.|::/.test(allCode)) {
    return 'rust';
  }

  // Swift
  if (/^(import|func|class|struct|enum|var|let)\s+\w+/.test(allCode) ||
      /@\w+|\.swift/.test(allCode)) {
    return 'swift';
  }

  // Kotlin
  if (/^(fun|class|data class|object|val|var)\s+\w+/.test(allCode) ||
      /println\(/.test(allCode)) {
    return 'kotlin';
  }

  // HTML
  if (/^<!DOCTYPE|<html|<head|<body|<div|<span|<p|<a|<img/.test(allCode)) {
    return 'html';
  }

  // CSS
  if (/^(@import|@media|@keyframes|\w+\s*\{)/.test(allCode) ||
      /:\s*[^;]+;/.test(allCode)) {
    return 'css';
  }

  // Shell/Bash
  if (/^#!\/bin\/(bash|sh|zsh)/.test(allCode) ||
      /^\$\w+\s*=/.test(allCode) ||
      /if\s+\[|then|fi|done/.test(allCode)) {
    return 'bash';
  }

  // JSON
  if (/^\s*[{[]/.test(allCode) && /[}\]]\s*$/.test(allCode)) {
    try {
      JSON.parse(allCode);
      return 'json';
    } catch {
      // Not valid JSON, continue
    }
  }

  // XML
  if (/^<\?xml|^<[a-zA-Z]+\s+[^>]*>/.test(allCode)) {
    return 'xml';
  }

  // YAML
  if (/^---|^\w+:\s*(|\[|{)/.test(allCode) ||
      /:\s*$/.test(lines[0])) {
    return 'yaml';
  }

  // Dockerfile
  if (/^FROM\s+\w+|^RUN\s+|^COPY\s+|^WORKDIR\s+/.test(allCode)) {
    return 'dockerfile';
  }

  // Markdown last (generic markers)
  // Markdown only when content is primarily Markdown
  if (/^#{1,6}\s+\w+/.test(allCode) && 
      !allCode.includes('def ') && 
      !allCode.includes('function ') && 
      !allCode.includes('SELECT ') &&
      !allCode.includes('import ') &&
      !allCode.includes('class ')) {
    // Check for Markdown structure (headings, lists)
    const markdownPatterns = (allCode.match(/^#{1,6}\s+|^\*\s+|^-\s+|^\d+\.\s+/gm) || []).length;
    const codePatterns = (allCode.match(/\b(def|function|class|import|SELECT|FROM|WHERE)\b/gi) || []).length;
    if (markdownPatterns > codePatterns) {
      return 'markdown';
    }
  }

  // Default to text
  return 'text';
};

// Language display names
const getLanguageDisplayName = (lang: string): string => {
  const languageMap: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'jsx': 'JSX',
    'tsx': 'TSX',
    'python': 'Python',
    'java': 'Java',
    'c': 'C',
    'cpp': 'C++',
    'csharp': 'C#',
    'php': 'PHP',
    'ruby': 'Ruby',
    'go': 'Go',
    'rust': 'Rust',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'sql': 'SQL',
    'html': 'HTML',
    'css': 'CSS',
    'bash': 'Bash',
    'shell': 'Shell',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'markdown': 'Markdown',
    'dockerfile': 'Dockerfile',
    'text': 'Text',
  };
  return languageMap[lang.toLowerCase()] || lang.toUpperCase();
};

// Code renderer with fenced-block detection and one-click copy
const CodeRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content || typeof content !== 'string') {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{content}</div>;
  }

  // Detect fences; support unclosed blocks during streaming
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  const codeBlocks: Array<{ language: string; code: string; index: number; isOpen?: boolean }> = [];
  let match;
  let blockIndex = 0;
  let lastIndex = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const detectedLang = match[1] || detectLanguage(match[2].trim());
    codeBlocks.push({
      language: detectedLang,
      code: match[2].trim(),
      index: blockIndex++,
      isOpen: false,
    });
    lastIndex = match.index + match[0].length;
  }

  // Check for unclosed fence during streaming
  const remaining = content.substring(lastIndex);
  const openCodeBlockMatch = remaining.match(/```(\w+)?\n?([\s\S]*)$/);
  if (openCodeBlockMatch) {
    // Odd ``` count means unclosed fence
    const allBackticks = (content.match(/```/g) || []).length;
    if (allBackticks % 2 === 1) {
      const language = openCodeBlockMatch[1] || detectLanguage(openCodeBlockMatch[2].trim() || '');
      const code = openCodeBlockMatch[2] || '';
      codeBlocks.push({
        language,
        code,
        index: blockIndex++,
        isOpen: true, // Unclosed fence
      });
    }
  }

  // Check if content is primarily Markdown
  const isMarkdownContent = (text: string): boolean => {
    const markdownPatterns = (text.match(/^#{1,6}\s+|^\*\s+|^-\s+|^\d+\.\s+|^>\s+/gm) || []).length;
    const codePatterns = (text.match(/\b(def|function|class|import|SELECT|FROM|WHERE|const|let|var|package)\b/gi) || []).length;
    // Markdown if more Markdown than code markers or multiple headings
    return markdownPatterns > 2 || (markdownPatterns > codePatterns && markdownPatterns > 0);
  };

  // No fences: check if entire content is code
  if (codeBlocks.length === 0) {
    // Primary Markdown should not render as code block
    if (isMarkdownContent(content)) {
      // Render as Markdown, not code block
      return <MarkdownRenderer content={content} />;
    }

    // Code heuristics: keywords, functions, brackets
    const codeIndicators = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+.*from/,
      /def\s+\w+\s*\(/,
      /#include/,
      /<\?php/,
      /SELECT\s+.*FROM/i,
      /public\s+class/,
      /package\s+\w+/,
    ];

    const hasCodeIndicators = codeIndicators.some(pattern => pattern.test(content));
    const hasCodeStructure = (content.includes('{') && content.includes('}')) || 
                             (content.includes('(') && content.includes(')')) ||
                             (content.includes('[') && content.includes(']'));

    if (hasCodeIndicators || (hasCodeStructure && content.split('\n').length > 3)) {
      const detectedLang = detectLanguage(content);
      // Markdown detection → MarkdownRenderer
      if (detectedLang === 'markdown') {
        return <MarkdownRenderer content={content} />;
      }
      codeBlocks.push({
        language: detectedLang,
        code: content.trim(),
        index: 0,
      });
    }
  }

  if (codeBlocks.length > 0) {
    if (codeBlocks.length === 1 && !content.includes('```')) {
      const { language, code, isOpen } = codeBlocks[0];
      return <CodeBlockView language={language} code={code} isOpen={isOpen} />;
    }

    // Split into code blocks and text (streaming fences)
    let partsIndex = 0;
    const parts: Array<{ type: 'text' | 'code'; content: string; codeInfo?: { language: string; code: string; index: number; isOpen?: boolean } }> = [];
    let textStartIndex = 0;

    // Process all blocks in order (including open)
    for (const codeBlock of codeBlocks) {
      // Locate block in source
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _blockStartPattern = codeBlock.isOpen 
        ? new RegExp(`\`\`\`${codeBlock.language ? codeBlock.language + '\\s*\\n?' : ''}`, 'g')
        : new RegExp(`\`\`\`${codeBlock.language ? codeBlock.language + '\\s*\\n?' : ''}[\\s\\S]*?\`\`\``, 'g');
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _blockStartIndex = -1;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _searchIndex = textStartIndex;
      
      // Build parts from block order
      // Text before block
      if (partsIndex < codeBlock.index) {
        // Approximate text offset
        const estimatedTextEnd = content.indexOf('```', textStartIndex);
        if (estimatedTextEnd > textStartIndex) {
          const textBefore = content.substring(textStartIndex, estimatedTextEnd).trim();
          if (textBefore) {
            parts.push({ type: 'text', content: textBefore });
          }
          textStartIndex = estimatedTextEnd;
        }
      }

      // Code block
      parts.push({ 
        type: 'code', 
        content: '', 
        codeInfo: {
          language: codeBlock.language,
          code: codeBlock.code,
          index: codeBlock.index,
          isOpen: codeBlock.isOpen,
        }
      });
      partsIndex++;
    }

    // Regex split for completed fences
    codeBlockRegex.lastIndex = 0;
    lastIndex = 0;
    const finalParts: Array<{ type: 'text' | 'code'; content: string; codeInfo?: { language: string; code: string; index: number; isOpen?: boolean } }> = [];
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Text before code block
      if (match.index > lastIndex) {
        const textBefore = content.substring(lastIndex, match.index).trim();
        if (textBefore) {
          finalParts.push({ type: 'text', content: textBefore });
        }
      }

      // Code block
      const currentMatch = match;
      const codeInfo = codeBlocks.find(block => 
        !block.isOpen && block.code === currentMatch![2].trim() && block.language === (currentMatch![1] || 'text')
      );
      if (codeInfo) {
        finalParts.push({ 
          type: 'code', 
          content: '', 
          codeInfo: {
            language: codeInfo.language,
            code: codeInfo.code,
            index: codeInfo.index,
            isOpen: false,
          }
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // Open fence and trailing text
    const remaining = content.substring(lastIndex);
    const openCodeBlock = codeBlocks.find(block => block.isOpen);
    if (openCodeBlock) {
      // Unclosed fence present
      finalParts.push({ 
        type: 'code', 
        content: '', 
        codeInfo: {
          language: openCodeBlock.language,
          code: openCodeBlock.code,
          index: openCodeBlock.index,
          isOpen: true,
        }
      });
    } else {
      // Trailing text
      if (remaining.trim()) {
        finalParts.push({ type: 'text', content: remaining.trim() });
      }
    }

    // Use regex split result
    parts.length = 0;
    parts.push(...finalParts);

    return (
      <div className="space-y-2">
        {parts.map((part, idx) => {
          if (part.type === 'code' && part.codeInfo) {
            const { language, code, isOpen, index } = part.codeInfo;
            return (
              <CodeBlockView
                key={`code-block-${index}`}
                language={language}
                code={code}
                isOpen={isOpen}
              />
            );
          }
          return (
            <div key={`text-seg-${idx}`} className="gochat-prose-text">
              <MarkdownRenderer content={part.content} compact />
            </div>
          );
        })}
      </div>
    );
  }

  // No fences: infer content type
  // Markdown → MarkdownRenderer (no background)
  if (isMarkdownContent(content)) {
    return <MarkdownRenderer content={content} compact />;
  }

  // Pure code → code block
  const detectedLang = detectLanguage(content);
  // Markdown detection → MarkdownRenderer
  if (detectedLang === 'markdown') {
    return <MarkdownRenderer content={content} />;
  }

  return <CodeBlockView language={detectedLang} code={content.trim()} />;
};

/** Lightweight streaming preview; avoids per-char Markdown reparse jank */
const StreamingAnswerPreview: React.FC<{
  content: string;
  fmt: ResponseFormat;
}> = ({ content, fmt }) => {
  const baseClass =
    'text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words';

  if (fmt === 'code') {
    return (
      <pre className={`${baseClass} font-mono text-[13px]`}>
        {content}
        <span className="gochat-stream-caret" aria-hidden />
      </pre>
    );
  }

  return (
    <div className={`gochat-streaming-answer ${baseClass}`}>
      {content}
      <span className="gochat-stream-caret" aria-hidden />
    </div>
  );
};

const ChatTypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 py-1">
    {[0, 1, 2].map((dot) => (
      <span
        key={dot}
        className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
        style={{ animationDelay: `${dot * 0.15}s` }}
      />
    ))}
  </div>
);

export interface ChatMessageContentProps {
  message: ChatBubble;
  /** Session default format (history without per-message snapshot) */
  fallbackFormat: ResponseFormat;
}

const renderFormattedAnswer = (
  content: string,
  fmt: ResponseFormat,
  isError: boolean
): React.ReactNode => {
  if (isError) {
    if (fmt === 'plain') return <PlainTextRenderer text={content} />;
    if (fmt === 'code') return <CodeRenderer content={content} />;
    return <MarkdownRenderer content={content} compact />;
  }

  const normalized = normalizeAssistantContentForFormat(content, fmt);

  if (fmt === 'plain') return <PlainTextRenderer text={normalized} />;
  if (fmt === 'markdown') return <MarkdownRenderer content={content} compact />;
  if (fmt === 'json') {
    if (isPrimarilyJsonPayload(normalized)) return <JSONRenderer content={normalized} />;
    return <MarkdownRenderer content={content} compact />;
  }
  if (fmt === 'csv') {
    if (isPrimarilyCsvPayload(content)) {
      const parts = parseCsvAnswer(content);
      if (parts.tableCsv.trim() || parts.downloadCsv.trim()) {
        return <CsvContentView csvText={content} showProse />;
      }
      return <PlainTextRenderer text={normalized} />;
    }
    return <MarkdownRenderer content={content} compact />;
  }
  if (fmt === 'code') return <CodeRenderer content={content} />;
  return <MarkdownRenderer content={content} compact />;
};

const ChatMessageContentInner: React.FC<ChatMessageContentProps> = ({
  message,
  fallbackFormat,
}) => {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isLoading = message.status === 'loading';
  const hasReasoning = Boolean(message.reasoning?.trim());
  const hasAnswer = Boolean(message.content?.trim());
  const reasoningStreaming = isLoading && hasReasoning && !message.reasoningComplete;
  const waitingForAnyOutput = isLoading && !hasReasoning && !hasAnswer;

  if (isUser) return <>{message.content}</>;
  if (waitingForAnyOutput) return <ChatTypingIndicator />;

  const fmt = resolveMessageResponseFormat(message.responseFormat, fallbackFormat);

  return (
    <div className="space-y-0">
      {(hasReasoning || reasoningStreaming) && (
        <GochatReasoningPanel
          reasoning={message.reasoning ?? ''}
          isStreaming={reasoningStreaming}
          hasAnswer={Boolean(message.reasoningComplete) || hasAnswer}
        />
      )}

      {hasAnswer ? (
        <div className="gochat-answer-block assistant-answer-block">
          {hasReasoning && (
            <div className="mb-2 flex select-none items-center gap-2">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700" />
              <span className="shrink-0 select-none text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Answer
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700" />
            </div>
          )}
          {isLoading && !isError ? (
            <StreamingAnswerPreview content={message.content} fmt={fmt} />
          ) : (
            renderFormattedAnswer(message.content, fmt, isError)
          )}
        </div>
      ) : reasoningStreaming ? null : isLoading ? (
        <ChatTypingIndicator />
      ) : null}
    </div>
  );
};

export const ChatMessageContent = memo(
  ChatMessageContentInner,
  (prev, next) => prev.message === next.message && prev.fallbackFormat === next.fallbackFormat
);

ChatMessageContent.displayName = 'ChatMessageContent';
