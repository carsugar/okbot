const TIMEOUT_MS = 1500;
const FAIL_OPEN = { known: true, suggestions: [] };

// Asks Datamuse whether `word` is a real word. Only the word is sent. Any error
// or timeout counts as "recognized", so the game never blocks on the service.
export async function lookupWord(word, fetchFn = fetch) {
  try {
    const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=4`;
    const response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return FAIL_OPEN;
    const found = (await response.json()).map((entry) => entry.word);
    const typed = word.toLowerCase();
    if (found[0]?.toLowerCase() === typed) return FAIL_OPEN;
    return { known: false, suggestions: found.filter((w) => w.toLowerCase() !== typed).slice(0, 2) };
  } catch {
    return FAIL_OPEN;
  }
}
