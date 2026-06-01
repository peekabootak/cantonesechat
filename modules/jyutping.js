/**
 * jyutping.js — Cantonese Jyutping Conversion Module
 *
 * Loads a comprehensive Jyutping dictionary (20,000+ characters) generated from CanCLID/to-jyutping.
 */

// Dictionary mapping Chinese characters to Jyutping romanization
let JYUTPING_MAP = {};
let isLoaded = false;

/**
 * Initialize the Jyutping dictionary by fetching the JSON file.
 * We fall back to a small built-in dictionary if the fetch fails.
 * @returns {Promise<boolean>} Success status
 */
export async function initJyutpingDictionary() {
  if (isLoaded) return true;
  
  try {
    const response = await fetch('./jyutping_dict.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    JYUTPING_MAP = await response.json();
    isLoaded = true;
    console.log('Jyutping dictionary loaded successfully:', Object.keys(JYUTPING_MAP).length, 'chars');
    return true;
  } catch (error) {
    console.warn('Failed to load comprehensive Jyutping dictionary. Using fallback.', error);
    // Minimal fallback just in case
    JYUTPING_MAP = {
      '你': 'nei5', '好': 'hou2', '我': 'ngo5', '佢': 'keoi5',
      '唔': 'm4', '係': 'hai6', '嘅': 'ge3', '啊': 'aa1'
    };
    return false;
  }
}

/**
 * Convert text to Jyutping separated by spaces
 * @param {string} text - Chinese text
 * @returns {string} Jyutping romanization
 */
export function toJyutping(text) {
  if (!text) return '';

  let result = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    
    if (JYUTPING_MAP[char]) {
      result.push(JYUTPING_MAP[char]);
    } else if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      // Unknown Chinese character - show as-is fallback
      result.push('?'); 
    } else if (/\s/.test(char)) {
      result.push(' ');
    }
    // Skip punctuation and non-Chinese chars in Jyutping output
    i++;
  }

  return result.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert text to array of { text, jyutping, isChinese } objects for word-level display.
 * Uses Forward Maximum Matching with dictionary words.
 * @param {string} text - Chinese text
 * @param {string[]} dictionaryWords - Optional array of multi-character words to prioritize
 * @returns {Array<{ text: string, jyutping: string, isChinese: boolean }>}
 */
export function toJyutpingSegments(text, dictionaryWords = []) {
  if (!text) return [];

  let segments = [];
  let i = 0;
  
  // Combine single character dictionary keys + provided multi-char words
  // Filter for only Chinese characters or dictionary entries
  const allKnownWords = new Set([
      ...Object.keys(JYUTPING_MAP),
      ...dictionaryWords
  ]);

  while (i < text.length) {
    const char = text[i];
    
    // Handle non-Chinese characters first (punctuation, numbers, English)
    if (!/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      if (segments.length > 0 && !segments[segments.length - 1].isChinese) {
        segments[segments.length - 1].text += char;
      } else {
        segments.push({ text: char, jyutping: '', isChinese: false });
      }
      i++;
      continue;
    }

    // Attempt Maximum Matching for Chinese characters
    let matched = false;
    // Look ahead up to 10 characters (or remaining text length)
    const maxLen = Math.min(10, text.length - i);
    
    for (let len = maxLen; len >= 1; len--) {
      const sub = text.substring(i, i + len);
      
      if (allKnownWords.has(sub)) {
        // We found a match in our word list or character map
        segments.push({
          text: sub,
          jyutping: lookupJyutping(sub) || '',
          isChinese: true
        });
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Unknown Chinese character
      segments.push({
        text: char,
        jyutping: '',
        isChinese: true
      });
      i++;
    }
  }

  return segments;
}

/**
 * Look up Jyutping for a single character/word
 * @param {string} word
 * @returns {string|null}
 */
export function lookupJyutping(word) {
  if (!word) return null;
  
  // Try exact match first
  if (JYUTPING_MAP[word]) return JYUTPING_MAP[word];
  
  // Try character by character for compounds
  if (word.length > 1) {
    let result = '';
    for (let char of word) {
        if (JYUTPING_MAP[char]) {
            result += JYUTPING_MAP[char] + ' ';
        } else {
             return null; // Stop if any char is unknown for the dictionary popups
        }
    }
    return result.trim();
  }
  
  return null;
}

