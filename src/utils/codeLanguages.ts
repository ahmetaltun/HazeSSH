import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

// Cache for loaded language extensions to prevent redundant dynamic imports
const languageCache = new Map<string, Extension>();

/**
 * Common language aliases for markdown code fences, short tags, and special filenames
 */
const ALIAS_MAP: Record<string, string> = {
  py: "python",
  python3: "python",
  rs: "rust",
  golang: "go",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  env: "shell",
  docker: "dockerfile",
  yml: "yaml",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  txt: "plain",
  plaintext: "plain",
  text: "plain",
  csharp: "c#",
  cs: "c#",
  rb: "ruby",
  kt: "kotlin",
  kts: "kotlin",
  tf: "hcl",
  terraform: "hcl",
  nginx: "nginx",
  conf: "nginx",
};

/**
 * Special filenames that might not have standard extensions
 */
const SPECIAL_FILES: Record<string, string> = {
  dockerfile: "Dockerfile",
  containerfile: "Dockerfile",
  makefile: "Makefile",
  gemfile: "Ruby",
  rakefile: "Ruby",
  vagrantfile: "Ruby",
  procfile: "YAML",
  "docker-compose.yml": "YAML",
  "docker-compose.yaml": "YAML",
  "nginx.conf": "Nginx",
  hosts: "Shell",
  "resolv.conf": "Shell",
  crontab: "Shell",
  sudoers: "Shell",
  authorized_keys: "Shell",
  known_hosts: "Shell",
};

/**
 * Finds a LanguageDescription by explicit language name or alias.
 */
export function findLanguageByName(name: string): LanguageDescription | null {
  const clean = name.trim().toLowerCase();
  const canonical = ALIAS_MAP[clean] || clean;

  if (canonical === "plain") return null;

  return (
    LanguageDescription.matchLanguageName(languages, canonical, true) ??
    LanguageDescription.matchLanguageName(languages, clean, true)
  );
}

/**
 * Finds a LanguageDescription from a filename.
 */
export function findLanguageByFileName(fileName: string): LanguageDescription | null {
  const cleanName = fileName.trim().toLowerCase();

  // Check special files without conventional extension
  if (SPECIAL_FILES[cleanName]) {
    const specialMatch = findLanguageByName(SPECIAL_FILES[cleanName]);
    if (specialMatch) return specialMatch;
  }

  // Check dotfiles
  if (cleanName.startsWith(".env") || cleanName.endsWith("rc") || cleanName.startsWith(".git")) {
    return findLanguageByName("shell");
  }

  return LanguageDescription.matchFilename(languages, fileName);
}

/**
 * Detects the user-facing display name of the language for a given file or override.
 */
export function detectLanguageName(fileName?: string, langOverride?: string): string {
  if (langOverride && langOverride.toLowerCase() !== "auto") {
    if (langOverride.toLowerCase() === "plain" || langOverride.toLowerCase() === "plaintext") {
      return "Plain Text";
    }
    const match = findLanguageByName(langOverride);
    return match ? match.name : langOverride;
  }

  if (!fileName) return "Plain Text";

  const match = findLanguageByFileName(fileName);
  return match ? match.name : "Plain Text";
}

/**
 * Loads the CodeMirror syntax highlighting extension for a given file name or language name.
 * Uses caching so each language parser is downloaded and evaluated only once.
 */
export async function loadLanguageExtension(
  fileName?: string,
  langOverride?: string
): Promise<Extension | null> {
  let desc: LanguageDescription | null = null;

  if (langOverride && langOverride.toLowerCase() !== "auto") {
    if (langOverride.toLowerCase() === "plain" || langOverride.toLowerCase() === "plaintext") {
      return null;
    }
    desc = findLanguageByName(langOverride);
  } else if (fileName) {
    desc = findLanguageByFileName(fileName);
  }

  if (!desc) {
    return null;
  }

  const cacheKey = desc.name;
  const cached = languageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const support = await desc.load();
    const extension = support.extension;
    languageCache.set(cacheKey, extension);
    return extension;
  } catch (err) {
    console.warn(`[CodeLanguages] Failed to dynamically load language parser for "${desc.name}":`, err);
    return null;
  }
}

/**
 * Popular languages shown at the top of language pickers
 */
export const POPULAR_LANGUAGES: readonly string[] = [
  "Auto",
  "Plain Text",
  "TypeScript",
  "JavaScript",
  "JSON",
  "YAML",
  "Python",
  "Shell",
  "HTML",
  "CSS",
  "SQL",
  "Rust",
  "Go",
  "C++",
  "C",
  "C#",
  "Java",
  "PHP",
  "Dockerfile",
  "Markdown",
  "XML",
  "TOML",
  "Nginx",
];

/**
 * Returns a sorted unique list of all available languages supported by CodeMirror.
 */
export function getAllAvailableLanguages(): string[] {
  const names = languages.map((l) => l.name);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}
