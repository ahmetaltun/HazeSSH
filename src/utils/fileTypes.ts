/**
 * Comprehensive File Type and Extension Intelligence Utility
 * Provides classification, MIME types, language labels, and icon categories
 * for SFTP and local file management.
 */

export type FileCategory = "image" | "pdf" | "markdown" | "code" | "media" | "binary";

export type FileIconCategory =
  | "image"
  | "pdf"
  | "markdown"
  | "code"
  | "media"
  | "archive"
  | "database"
  | "config"
  | "text"
  | "generic";

// Special filenames without extensions or with unconventional extensions
const SPECIAL_FILENAMES: Record<string, { category: FileCategory; label: string; icon: FileIconCategory }> = {
  dockerfile: { category: "code", label: "Dockerfile", icon: "code" },
  containerfile: { category: "code", label: "Containerfile", icon: "code" },
  makefile: { category: "code", label: "Makefile", icon: "code" },
  gemfile: { category: "code", label: "Gemfile", icon: "code" },
  procfile: { category: "code", label: "Procfile", icon: "code" },
  rakefile: { category: "code", label: "Rakefile", icon: "code" },
  vagrantfile: { category: "code", label: "Vagrantfile", icon: "code" },
  jenkinsfile: { category: "code", label: "Jenkinsfile", icon: "code" },
  license: { category: "code", label: "License", icon: "text" },
  copying: { category: "code", label: "License", icon: "text" },
  readme: { category: "markdown", label: "README", icon: "markdown" },
  changelog: { category: "markdown", label: "Changelog", icon: "markdown" },
  hosts: { category: "code", label: "Hosts Configuration", icon: "config" },
  "resolv.conf": { category: "code", label: "DNS Configuration", icon: "config" },
  "nginx.conf": { category: "code", label: "Nginx Configuration", icon: "config" },
  "apache2.conf": { category: "code", label: "Apache Configuration", icon: "config" },
  "httpd.conf": { category: "code", label: "Apache Configuration", icon: "config" },
  fstab: { category: "code", label: "Fstab Configuration", icon: "config" },
  sudoers: { category: "code", label: "Sudoers Configuration", icon: "config" },
  crontab: { category: "code", label: "Cron Table", icon: "config" },
  passwd: { category: "code", label: "User Database", icon: "config" },
  group: { category: "code", label: "Group Database", icon: "config" },
  shadow: { category: "code", label: "Shadow Passwords", icon: "config" },
  authorized_keys: { category: "code", label: "SSH Authorized Keys", icon: "config" },
  known_hosts: { category: "code", label: "SSH Known Hosts", icon: "config" },
  id_rsa: { category: "code", label: "SSH Private Key", icon: "config" },
  "id_rsa.pub": { category: "code", label: "SSH Public Key", icon: "config" },
  id_ed25519: { category: "code", label: "SSH Private Key", icon: "config" },
  "id_ed25519.pub": { category: "code", label: "SSH Public Key", icon: "config" },
};

// Extension definition interface
interface ExtensionInfo {
  readonly category: FileCategory;
  readonly label: string;
  readonly mime: string;
  readonly icon: FileIconCategory;
}

// Master extension lookup dictionary
const EXTENSION_MAP: Record<string, ExtensionInfo> = {
  // Web & Frontend
  php: { category: "code", label: "PHP", mime: "application/x-httpd-php", icon: "code" },
  phtml: { category: "code", label: "PHP Template", mime: "application/x-httpd-php", icon: "code" },
  php3: { category: "code", label: "PHP", mime: "application/x-httpd-php", icon: "code" },
  php4: { category: "code", label: "PHP", mime: "application/x-httpd-php", icon: "code" },
  php5: { category: "code", label: "PHP", mime: "application/x-httpd-php", icon: "code" },
  phps: { category: "code", label: "PHP Source", mime: "application/x-httpd-php", icon: "code" },
  ts: { category: "code", label: "TypeScript", mime: "text/typescript", icon: "code" },
  tsx: { category: "code", label: "TypeScript (React/TSX)", mime: "text/typescript", icon: "code" },
  mts: { category: "code", label: "TypeScript Module", mime: "text/typescript", icon: "code" },
  cts: { category: "code", label: "TypeScript CommonJS", mime: "text/typescript", icon: "code" },
  js: { category: "code", label: "JavaScript", mime: "text/javascript", icon: "code" },
  jsx: { category: "code", label: "JavaScript (React/JSX)", mime: "text/javascript", icon: "code" },
  mjs: { category: "code", label: "JavaScript Module", mime: "text/javascript", icon: "code" },
  cjs: { category: "code", label: "JavaScript CommonJS", mime: "text/javascript", icon: "code" },
  vue: { category: "code", label: "Vue Component", mime: "text/x-vue", icon: "code" },
  svelte: { category: "code", label: "Svelte Component", mime: "text/x-svelte", icon: "code" },
  astro: { category: "code", label: "Astro Component", mime: "text/x-astro", icon: "code" },
  html: { category: "code", label: "HTML", mime: "text/html", icon: "code" },
  htm: { category: "code", label: "HTML", mime: "text/html", icon: "code" },
  xhtml: { category: "code", label: "XHTML", mime: "application/xhtml+xml", icon: "code" },
  css: { category: "code", label: "CSS", mime: "text/css", icon: "code" },
  scss: { category: "code", label: "SASS/SCSS", mime: "text/x-scss", icon: "code" },
  sass: { category: "code", label: "SASS", mime: "text/x-sass", icon: "code" },
  less: { category: "code", label: "LESS", mime: "text/x-less", icon: "code" },
  styl: { category: "code", label: "Stylus", mime: "text/x-stylus", icon: "code" },
  graphql: { category: "code", label: "GraphQL", mime: "application/graphql", icon: "code" },
  gql: { category: "code", label: "GraphQL", mime: "application/graphql", icon: "code" },
  prisma: { category: "code", label: "Prisma Schema", mime: "text/plain", icon: "database" },

  // Data & Configurations
  yaml: { category: "code", label: "YAML Configuration", mime: "text/yaml", icon: "config" },
  yml: { category: "code", label: "YAML Configuration", mime: "text/yaml", icon: "config" },
  toml: { category: "code", label: "TOML Configuration", mime: "text/x-toml", icon: "config" },
  json: { category: "code", label: "JSON", mime: "application/json", icon: "code" },
  jsonc: { category: "code", label: "JSON with Comments", mime: "application/json", icon: "code" },
  json5: { category: "code", label: "JSON5", mime: "application/json5", icon: "code" },
  xml: { category: "code", label: "XML", mime: "application/xml", icon: "code" },
  xsd: { category: "code", label: "XML Schema", mime: "application/xml", icon: "code" },
  xsl: { category: "code", label: "XSL Stylesheet", mime: "application/xml", icon: "code" },
  xslt: { category: "code", label: "XSLT Stylesheet", mime: "application/xml", icon: "code" },
  ini: { category: "code", label: "INI Configuration", mime: "text/plain", icon: "config" },
  cfg: { category: "code", label: "Configuration", mime: "text/plain", icon: "config" },
  conf: { category: "code", label: "Configuration", mime: "text/plain", icon: "config" },
  cnf: { category: "code", label: "Configuration", mime: "text/plain", icon: "config" },
  config: { category: "code", label: "Configuration", mime: "text/plain", icon: "config" },
  properties: { category: "code", label: "Java Properties", mime: "text/plain", icon: "config" },
  env: { category: "code", label: "Environment Variables", mime: "text/plain", icon: "config" },
  dotenv: { category: "code", label: "Environment Variables", mime: "text/plain", icon: "config" },
  editorconfig: { category: "code", label: "EditorConfig", mime: "text/plain", icon: "config" },
  gitconfig: { category: "code", label: "Git Config", mime: "text/plain", icon: "config" },
  gitignore: { category: "code", label: "Git Ignore", mime: "text/plain", icon: "config" },
  gitattributes: { category: "code", label: "Git Attributes", mime: "text/plain", icon: "config" },
  dockerignore: { category: "code", label: "Docker Ignore", mime: "text/plain", icon: "config" },
  npmrc: { category: "code", label: "NPM Config", mime: "text/plain", icon: "config" },
  yarnrc: { category: "code", label: "Yarn Config", mime: "text/plain", icon: "config" },
  lock: { category: "code", label: "Lockfile", mime: "text/plain", icon: "config" },
  plist: { category: "code", label: "Apple Property List", mime: "application/x-plist", icon: "config" },
  tf: { category: "code", label: "Terraform", mime: "text/plain", icon: "config" },
  tfvars: { category: "code", label: "Terraform Variables", mime: "text/plain", icon: "config" },
  hcl: { category: "code", label: "HashiCorp HCL", mime: "text/plain", icon: "config" },
  csv: { category: "code", label: "CSV Spreadsheet", mime: "text/csv", icon: "database" },
  tsv: { category: "code", label: "TSV Spreadsheet", mime: "text/tab-separated-values", icon: "database" },
  proto: { category: "code", label: "Protocol Buffers", mime: "text/plain", icon: "code" },

  // Backend, Systems & General Programming
  py: { category: "code", label: "Python", mime: "text/x-python", icon: "code" },
  pyw: { category: "code", label: "Python (Windowed)", mime: "text/x-python", icon: "code" },
  pyi: { category: "code", label: "Python Stub", mime: "text/x-python", icon: "code" },
  rs: { category: "code", label: "Rust", mime: "text/x-rust", icon: "code" },
  go: { category: "code", label: "Go", mime: "text/x-go", icon: "code" },
  java: { category: "code", label: "Java", mime: "text/x-java-source", icon: "code" },
  kt: { category: "code", label: "Kotlin", mime: "text/x-kotlin", icon: "code" },
  kts: { category: "code", label: "Kotlin Script", mime: "text/x-kotlin", icon: "code" },
  scala: { category: "code", label: "Scala", mime: "text/x-scala", icon: "code" },
  sc: { category: "code", label: "Scala Script", mime: "text/x-scala", icon: "code" },
  groovy: { category: "code", label: "Groovy", mime: "text/x-groovy", icon: "code" },
  c: { category: "code", label: "C Source", mime: "text/x-c", icon: "code" },
  h: { category: "code", label: "C/C++ Header", mime: "text/x-c", icon: "code" },
  cpp: { category: "code", label: "C++ Source", mime: "text/x-c++", icon: "code" },
  cc: { category: "code", label: "C++ Source", mime: "text/x-c++", icon: "code" },
  cxx: { category: "code", label: "C++ Source", mime: "text/x-c++", icon: "code" },
  hpp: { category: "code", label: "C++ Header", mime: "text/x-c++", icon: "code" },
  hh: { category: "code", label: "C++ Header", mime: "text/x-c++", icon: "code" },
  hxx: { category: "code", label: "C++ Header", mime: "text/x-c++", icon: "code" },
  cs: { category: "code", label: "C#", mime: "text/x-csharp", icon: "code" },
  csx: { category: "code", label: "C# Script", mime: "text/x-csharp", icon: "code" },
  rb: { category: "code", label: "Ruby", mime: "text/x-ruby", icon: "code" },
  erb: { category: "code", label: "Embedded Ruby", mime: "text/x-ruby", icon: "code" },
  rake: { category: "code", label: "Rake Task", mime: "text/x-ruby", icon: "code" },
  gemspec: { category: "code", label: "Ruby GemSpec", mime: "text/x-ruby", icon: "code" },
  swift: { category: "code", label: "Swift", mime: "text/x-swift", icon: "code" },
  m: { category: "code", label: "Objective-C", mime: "text/x-objc", icon: "code" },
  mm: { category: "code", label: "Objective-C++", mime: "text/x-objc++", icon: "code" },
  dart: { category: "code", label: "Dart", mime: "text/x-dart", icon: "code" },
  lua: { category: "code", label: "Lua", mime: "text/x-lua", icon: "code" },
  pl: { category: "code", label: "Perl", mime: "text/x-perl", icon: "code" },
  pm: { category: "code", label: "Perl Module", mime: "text/x-perl", icon: "code" },
  r: { category: "code", label: "R Script", mime: "text/x-r", icon: "code" },
  rmd: { category: "code", label: "R Markdown", mime: "text/x-r", icon: "markdown" },
  jl: { category: "code", label: "Julia", mime: "text/x-julia", icon: "code" },
  zig: { category: "code", label: "Zig", mime: "text/x-zig", icon: "code" },
  nim: { category: "code", label: "Nim", mime: "text/x-nim", icon: "code" },
  ex: { category: "code", label: "Elixir", mime: "text/x-elixir", icon: "code" },
  exs: { category: "code", label: "Elixir Script", mime: "text/x-elixir", icon: "code" },
  erl: { category: "code", label: "Erlang", mime: "text/x-erlang", icon: "code" },
  hrl: { category: "code", label: "Erlang Header", mime: "text/x-erlang", icon: "code" },
  hs: { category: "code", label: "Haskell", mime: "text/x-haskell", icon: "code" },
  lhs: { category: "code", label: "Literate Haskell", mime: "text/x-haskell", icon: "code" },
  clj: { category: "code", label: "Clojure", mime: "text/x-clojure", icon: "code" },
  cljs: { category: "code", label: "ClojureScript", mime: "text/x-clojure", icon: "code" },
  lisp: { category: "code", label: "Common Lisp", mime: "text/x-lisp", icon: "code" },
  lsp: { category: "code", label: "Lisp", mime: "text/x-lisp", icon: "code" },
  scm: { category: "code", label: "Scheme", mime: "text/x-scheme", icon: "code" },
  rkt: { category: "code", label: "Racket", mime: "text/x-racket", icon: "code" },

  // Shells & Scripts
  sh: { category: "code", label: "Shell Script", mime: "application/x-sh", icon: "code" },
  bash: { category: "code", label: "Bash Script", mime: "application/x-sh", icon: "code" },
  zsh: { category: "code", label: "Zsh Script", mime: "application/x-sh", icon: "code" },
  fish: { category: "code", label: "Fish Script", mime: "text/plain", icon: "code" },
  ksh: { category: "code", label: "Korn Shell Script", mime: "application/x-sh", icon: "code" },
  csh: { category: "code", label: "C Shell Script", mime: "application/x-csh", icon: "code" },
  tcsh: { category: "code", label: "TC Shell Script", mime: "application/x-csh", icon: "code" },
  bat: { category: "code", label: "Batch File", mime: "application/x-bat", icon: "code" },
  cmd: { category: "code", label: "Command Script", mime: "application/x-bat", icon: "code" },
  ps1: { category: "code", label: "PowerShell Script", mime: "application/x-powershell", icon: "code" },
  psm1: { category: "code", label: "PowerShell Module", mime: "application/x-powershell", icon: "code" },
  psd1: { category: "code", label: "PowerShell Data", mime: "application/x-powershell", icon: "code" },
  awk: { category: "code", label: "AWK Script", mime: "text/plain", icon: "code" },
  sed: { category: "code", label: "Sed Script", mime: "text/plain", icon: "code" },

  // Database
  sql: { category: "code", label: "SQL Query", mime: "application/sql", icon: "database" },
  psql: { category: "code", label: "PostgreSQL Query", mime: "application/sql", icon: "database" },
  ddl: { category: "code", label: "SQL DDL", mime: "application/sql", icon: "database" },
  dml: { category: "code", label: "SQL DML", mime: "application/sql", icon: "database" },

  // Markdown & Documentation
  md: { category: "markdown", label: "Markdown", mime: "text/markdown", icon: "markdown" },
  markdown: { category: "markdown", label: "Markdown", mime: "text/markdown", icon: "markdown" },
  mdown: { category: "markdown", label: "Markdown", mime: "text/markdown", icon: "markdown" },
  mkdn: { category: "markdown", label: "Markdown", mime: "text/markdown", icon: "markdown" },
  mdx: { category: "markdown", label: "MDX Document", mime: "text/mdx", icon: "markdown" },
  txt: { category: "code", label: "Plain Text", mime: "text/plain", icon: "text" },
  text: { category: "code", label: "Plain Text", mime: "text/plain", icon: "text" },
  log: { category: "code", label: "Log File", mime: "text/plain", icon: "text" },
  out: { category: "code", label: "Output Log", mime: "text/plain", icon: "text" },
  err: { category: "code", label: "Error Log", mime: "text/plain", icon: "text" },
  rst: { category: "code", label: "reStructuredText", mime: "text/x-rst", icon: "text" },
  adoc: { category: "code", label: "AsciiDoc", mime: "text/asciidoc", icon: "text" },
  tex: { category: "code", label: "LaTeX Document", mime: "application/x-tex", icon: "text" },
  latex: { category: "code", label: "LaTeX Document", mime: "application/x-tex", icon: "text" },
  diff: { category: "code", label: "Diff Patch", mime: "text/x-diff", icon: "text" },
  patch: { category: "code", label: "Patch File", mime: "text/x-diff", icon: "text" },

  // PDF Document
  pdf: { category: "pdf", label: "PDF Document", mime: "application/pdf", icon: "pdf" },

  // Images
  png: { category: "image", label: "PNG Image", mime: "image/png", icon: "image" },
  jpg: { category: "image", label: "JPEG Image", mime: "image/jpeg", icon: "image" },
  jpeg: { category: "image", label: "JPEG Image", mime: "image/jpeg", icon: "image" },
  gif: { category: "image", label: "GIF Animation", mime: "image/gif", icon: "image" },
  webp: { category: "image", label: "WebP Image", mime: "image/webp", icon: "image" },
  svg: { category: "image", label: "SVG Vector Graphics", mime: "image/svg+xml", icon: "image" },
  ico: { category: "image", label: "Icon File", mime: "image/x-icon", icon: "image" },
  bmp: { category: "image", label: "Bitmap Image", mime: "image/bmp", icon: "image" },
  tiff: { category: "image", label: "TIFF Image", mime: "image/tiff", icon: "image" },
  tif: { category: "image", label: "TIFF Image", mime: "image/tiff", icon: "image" },
  avif: { category: "image", label: "AVIF Image", mime: "image/avif", icon: "image" },
  cur: { category: "image", label: "Cursor Image", mime: "image/x-icon", icon: "image" },

  // Media (Audio & Video)
  mp3: { category: "media", label: "MP3 Audio", mime: "audio/mpeg", icon: "media" },
  wav: { category: "media", label: "WAV Audio", mime: "audio/wav", icon: "media" },
  ogg: { category: "media", label: "OGG Audio", mime: "audio/ogg", icon: "media" },
  m4a: { category: "media", label: "M4A Audio", mime: "audio/mp4", icon: "media" },
  flac: { category: "media", label: "FLAC Audio", mime: "audio/flac", icon: "media" },
  aac: { category: "media", label: "AAC Audio", mime: "audio/aac", icon: "media" },
  opus: { category: "media", label: "Opus Audio", mime: "audio/opus", icon: "media" },
  mp4: { category: "media", label: "MP4 Video", mime: "video/mp4", icon: "media" },
  webm: { category: "media", label: "WebM Video", mime: "video/webm", icon: "media" },
  mov: { category: "media", label: "QuickTime Video", mime: "video/quicktime", icon: "media" },
  mkv: { category: "media", label: "Matroska Video", mime: "video/x-matroska", icon: "media" },
  avi: { category: "media", label: "AVI Video", mime: "video/x-msvideo", icon: "media" },

  // Archives & Compressed Packages
  zip: { category: "binary", label: "ZIP Archive", mime: "application/zip", icon: "archive" },
  tar: { category: "binary", label: "TAR Archive", mime: "application/x-tar", icon: "archive" },
  gz: { category: "binary", label: "GZip Compressed Archive", mime: "application/gzip", icon: "archive" },
  tgz: { category: "binary", label: "GZip TAR Archive", mime: "application/gzip", icon: "archive" },
  bz2: { category: "binary", label: "BZip2 Archive", mime: "application/x-bzip2", icon: "archive" },
  tbz2: { category: "binary", label: "BZip2 TAR Archive", mime: "application/x-bzip2", icon: "archive" },
  xz: { category: "binary", label: "XZ Archive", mime: "application/x-xz", icon: "archive" },
  txz: { category: "binary", label: "XZ TAR Archive", mime: "application/x-xz", icon: "archive" },
  "7z": { category: "binary", label: "7-Zip Archive", mime: "application/x-7z-compressed", icon: "archive" },
  rar: { category: "binary", label: "RAR Archive", mime: "application/vnd.rar", icon: "archive" },
  zst: { category: "binary", label: "Zstandard Archive", mime: "application/zstd", icon: "archive" },
  iso: { category: "binary", label: "Disk Image", mime: "application/x-iso9660-image", icon: "archive" },
  dmg: { category: "binary", label: "Apple Disk Image", mime: "application/x-apple-diskimage", icon: "archive" },
  deb: { category: "binary", label: "Debian Package", mime: "application/vnd.debian.binary-package", icon: "archive" },
  rpm: { category: "binary", label: "RPM Package", mime: "application/x-rpm", icon: "archive" },
  apk: { category: "binary", label: "Android Package", mime: "application/vnd.android.package-archive", icon: "archive" },

  // Binary Executables & Bytecode
  exe: { category: "binary", label: "Windows Executable", mime: "application/x-msdownload", icon: "generic" },
  dll: { category: "binary", label: "Dynamic Link Library", mime: "application/x-msdownload", icon: "generic" },
  so: { category: "binary", label: "Shared Object Library", mime: "application/octet-stream", icon: "generic" },
  dylib: { category: "binary", label: "macOS Dynamic Library", mime: "application/octet-stream", icon: "generic" },
  bin: { category: "binary", label: "Binary Data", mime: "application/octet-stream", icon: "generic" },
  wasm: { category: "binary", label: "WebAssembly", mime: "application/wasm", icon: "generic" },
  class: { category: "binary", label: "Java Bytecode", mime: "application/java-vm", icon: "generic" },
  jar: { category: "binary", label: "Java Archive", mime: "application/java-archive", icon: "archive" },
  pyc: { category: "binary", label: "Python Bytecode", mime: "application/x-python-code", icon: "generic" },
  sqlite: { category: "binary", label: "SQLite Database", mime: "application/vnd.sqlite3", icon: "database" },
  db: { category: "binary", label: "Database File", mime: "application/octet-stream", icon: "database" },
};

/**
 * Returns the file extension in lower case.
 */
export function getFileExtension(fileName: string): string {
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return clean.slice(lastDot + 1);
}

/**
 * Categorizes a file for preview & editor routing.
 */
export function getFileCategory(fileName: string): FileCategory {
  const clean = fileName.trim().toLowerCase();

  // 1. Check exact special filenames
  if (SPECIAL_FILENAMES[clean]) {
    return SPECIAL_FILENAMES[clean].category;
  }

  // 2. Check dotfiles like .env, .env.local, .bashrc, .zshrc
  if (clean.startsWith(".env") || clean.endsWith("rc") || clean.startsWith(".git")) {
    return "code";
  }

  // 3. Check extension lookup
  const ext = getFileExtension(clean);
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext].category;
  }

  // 4. Default: If no extension and not known binary, treat as text/code
  if (!ext) {
    return "code";
  }

  return "binary";
}

/**
 * Checks whether the file is safe and appropriate to open in the in-app text editor.
 */
export function isEditableText(fileName: string): boolean {
  const category = getFileCategory(fileName);
  return category === "code" || category === "markdown";
}

/**
 * Returns a human-friendly language or file type name (e.g. "PHP", "TypeScript (TSX)", "YAML").
 */
export function getLanguageLabel(fileName: string): string {
  const clean = fileName.trim().toLowerCase();

  // Special files
  if (SPECIAL_FILENAMES[clean]) {
    return SPECIAL_FILENAMES[clean].label;
  }
  if (clean.startsWith(".env")) {
    return "Environment Configuration";
  }
  if (clean.endsWith("rc")) {
    return "Shell Run-Commands";
  }

  const ext = getFileExtension(clean);
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext].label;
  }

  if (!ext) {
    return "Plain Text / Configuration";
  }

  return `${ext.toUpperCase()} File`;
}

/**
 * Returns the MIME type for media, images, or documents.
 */
export function getMimeType(fileName: string): string {
  const ext = getFileExtension(fileName);
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext].mime;
  }
  return "text/plain";
}

/**
 * Returns the icon category for rendering distinct icons in directory listings.
 */
export function getFileIconCategory(fileName: string): FileIconCategory {
  const clean = fileName.trim().toLowerCase();

  if (SPECIAL_FILENAMES[clean]) {
    return SPECIAL_FILENAMES[clean].icon;
  }
  if (clean.startsWith(".env") || clean.endsWith("rc")) {
    return "config";
  }

  const ext = getFileExtension(clean);
  if (ext && EXTENSION_MAP[ext]) {
    return EXTENSION_MAP[ext].icon;
  }

  if (!ext) {
    return "text";
  }

  return "generic";
}
