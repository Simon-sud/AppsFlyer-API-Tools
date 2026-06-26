/** Copy via selecting a live DOM node (most reliable inside modals). */
export function copyFromElement(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  range.selectNodeContents(element);

  selection.removeAllRanges();
  selection.addRange(range);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  selection.removeAllRanges();
  return ok;
}

/** Synchronous execCommand fallback using an off-screen textarea. */
export function copyTextToClipboardSync(text: string): boolean {
  if (!text) return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  textarea.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;padding:0;border:0;outline:0;opacity:0;';

  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(textarea);
  return ok;
}

async function verifyClipboardText(expected: string): Promise<boolean> {
  if (!navigator.clipboard?.readText) return true;
  try {
    const actual = await navigator.clipboard.readText();
    return actual.trim() === expected.trim();
  } catch {
    return true;
  }
}

export type CopyOptions = {
  /** When provided, copy from rendered DOM first (works best in Radix sheets). */
  sourceElement?: HTMLElement | null;
};

/**
 * Copy text to clipboard. Tries Clipboard API, DOM selection, then textarea fallback.
 * Only returns true when a strategy likely succeeded.
 */
export async function copyTextToClipboard(
  text: string,
  options: CopyOptions = {}
): Promise<boolean> {
  const payload = text?.trim();
  if (!payload) return false;

  const { sourceElement } = options;

  if (sourceElement?.textContent?.trim()) {
    if (copyFromElement(sourceElement)) {
      if (await verifyClipboardText(sourceElement.textContent)) return true;
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      if (await verifyClipboardText(payload)) return true;
    }
  } catch {
    /* fall through */
  }

  if (copyTextToClipboardSync(payload)) {
    if (await verifyClipboardText(payload)) return true;
  }

  if (sourceElement && copyFromElement(sourceElement)) {
    if (await verifyClipboardText(sourceElement.textContent ?? payload)) return true;
  }

  return false;
}
