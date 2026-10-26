import { useState, useEffect, useMemo, useCallback } from "react";
import CodeMirror, {
  EditorView,
  keymap,
  type Extension,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";
import { useThemeStore, DARK_THEMES } from "@/stores/useThemeStore";
import { loadLanguageExtension } from "@/utils/codeLanguages";

export interface CodeEditorProps {
  readonly value: string;
  readonly onChange?: (val: string) => void;
  readonly fileName?: string;
  readonly language?: string;
  readonly readOnly?: boolean;
  readonly lineWrapping?: boolean;
  readonly onSave?: () => void;
  readonly onCursorChange?: (line: number, col: number) => void;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly height?: string;
  readonly minHeight?: string;
  readonly maxHeight?: string;
}

// Custom Dark Syntax Highlighting Theme (Dracula-inspired palette blending into DaisyUI)
const hazeDarkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "transparent",
    foreground: "#f8f8f2",
    caret: "#ff79c6",
    selection: "rgba(255, 121, 198, 0.25)",
    selectionMatch: "rgba(255, 121, 198, 0.35)",
    lineHighlight: "rgba(255, 255, 255, 0.04)",
    gutterBackground: "transparent",
    gutterForeground: "rgba(255, 255, 255, 0.35)",
    gutterActiveForeground: "#ff79c6",
    gutterBorder: "rgba(255, 255, 255, 0.08)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    fontSize: "12px",
  },
  styles: [
    { tag: t.keyword, color: "#ff79c6", fontWeight: "bold" },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: "#f8f8f2" },
    { tag: [t.propertyName], color: "#8be9fd" },
    { tag: [t.variableName], color: "#50fa7b" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#50fa7b" },
    { tag: [t.labelName], color: "#8be9fd" },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#bd93f9" },
    { tag: [t.definition(t.name), t.separator], color: "#f8f8f2" },
    { tag: [t.brace, t.bracket, t.paren], color: "#f8f8f2" },
    { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#8be9fd", fontStyle: "italic" },
    { tag: [t.number], color: "#bd93f9" },
    { tag: [t.bool, t.null], color: "#bd93f9", fontWeight: "bold" },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#ff79c6" },
    { tag: [t.meta, t.comment], color: "#6272a4", fontStyle: "italic" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "#8be9fd", textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: "#bd93f9" },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#bd93f9" },
    { tag: [t.processingInstruction, t.string, t.inserted], color: "#f1fa8c" },
    { tag: t.invalid, color: "#ff5555" },
  ],
});

// Custom Light Syntax Highlighting Theme (GitHub-inspired palette blending into DaisyUI)
const hazeLightTheme = createTheme({
  theme: "light",
  settings: {
    background: "transparent",
    foreground: "#24292f",
    caret: "#0969da",
    selection: "rgba(9, 105, 218, 0.2)",
    selectionMatch: "rgba(9, 105, 218, 0.3)",
    lineHighlight: "rgba(0, 0, 0, 0.03)",
    gutterBackground: "transparent",
    gutterForeground: "rgba(0, 0, 0, 0.35)",
    gutterActiveForeground: "#0969da",
    gutterBorder: "rgba(0, 0, 0, 0.08)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    fontSize: "12px",
  },
  styles: [
    { tag: t.keyword, color: "#cf222e", fontWeight: "bold" },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: "#24292f" },
    { tag: [t.propertyName], color: "#953800" },
    { tag: [t.variableName], color: "#0969da" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#8250df" },
    { tag: [t.labelName], color: "#953800" },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#0550ae" },
    { tag: [t.definition(t.name), t.separator], color: "#24292f" },
    { tag: [t.brace, t.bracket, t.paren], color: "#24292f" },
    { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#116329" },
    { tag: [t.number], color: "#0550ae" },
    { tag: [t.bool, t.null], color: "#0550ae", fontWeight: "bold" },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#cf222e" },
    { tag: [t.meta, t.comment], color: "#6e7781", fontStyle: "italic" },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: "#0969da", textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: "#0550ae" },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#0550ae" },
    { tag: [t.processingInstruction, t.string, t.inserted], color: "#0a3069" },
    { tag: t.invalid, color: "#cf222e" },
  ],
});

// Structural layout overrides so CodeMirror fills containers gracefully
const baseLayoutTheme = EditorView.theme({
  "&": {
    height: "100%",
    maxHeight: "100%",
    width: "100%",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    overflow: "auto !important",
    fontFamily: "inherit",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "8px 0",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-gutters": {
    userSelect: "none",
    borderRight: "1px solid var(--color-base-300, rgba(255, 255, 255, 0.1))",
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 12px",
    minWidth: "36px",
    textAlign: "right",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-foldGutter": {
    width: "14px",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "rgba(116, 128, 255, 0.2)",
    border: "1px solid rgba(116, 128, 255, 0.4)",
    color: "inherit",
    borderRadius: "3px",
    padding: "0 4px",
    margin: "0 2px",
  },
});

export function CodeEditor({
  value,
  onChange,
  fileName,
  language,
  readOnly = false,
  lineWrapping = false,
  onSave,
  onCursorChange,
  placeholder,
  autoFocus = false,
  className = "",
  height = "100%",
  minHeight,
  maxHeight,
}: CodeEditorProps) {
  const currentTheme = useThemeStore((state) => state.currentTheme);
  const isDark = useMemo(
    () => DARK_THEMES.some((t) => t.id === currentTheme),
    [currentTheme]
  );

  const [langExtension, setLangExtension] = useState<Extension | null>(null);

  // Dynamic language loading
  useEffect(() => {
    let isMounted = true;

    loadLanguageExtension(fileName, language)
      .then((ext) => {
        if (isMounted) {
          setLangExtension(ext);
        }
      })
      .catch((err) => {
        console.warn("[CodeEditor] Failed to load language extension:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [fileName, language]);

  // Save shortcut handler (Cmd+S / Ctrl+S)
  const saveKeymap = useMemo(() => {
    if (!onSave) return [];
    return keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSave();
          return true;
        },
      },
    ]);
  }, [onSave]);

  // Combined extensions
  const extensions = useMemo(() => {
    const list: Extension[] = [baseLayoutTheme, saveKeymap];

    if (lineWrapping) {
      list.push(EditorView.lineWrapping);
    }

    if (langExtension) {
      list.push(langExtension);
    }

    return list;
  }, [lineWrapping, langExtension, saveKeymap]);

  const handleUpdate = useCallback(
    (viewUpdate: ViewUpdate) => {
      if (onCursorChange && viewUpdate.selectionSet) {
        const head = viewUpdate.state.selection.main.head;
        const line = viewUpdate.state.doc.lineAt(head);
        const col = head - line.from + 1;
        onCursorChange(line.number, col);
      }
    },
    [onCursorChange]
  );

  const activeThemeExtension = isDark ? hazeDarkTheme : hazeLightTheme;
  const isFullHeight = height === "100%";

  return (
    <div
      className={`w-full overflow-hidden ${
        isFullHeight ? "h-full flex flex-col min-h-0 flex-1" : ""
      } ${className}`}
      style={isFullHeight ? { height: "100%" } : undefined}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={activeThemeExtension}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        autoFocus={autoFocus}
        placeholder={placeholder}
        indentWithTab={true}
        height={height}
        minHeight={minHeight}
        maxHeight={maxHeight}
        onUpdate={handleUpdate}
        className={isFullHeight ? "h-full w-full flex-1 min-h-0 flex flex-col" : "w-full"}
        style={isFullHeight ? { height: "100%" } : undefined}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: !readOnly,
          highlightActiveLine: !readOnly,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: !readOnly,
          autocompletion: !readOnly,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightSelectionMatches: true,
          searchKeymap: true,
          history: !readOnly,
          drawSelection: true,
        }}
      />
    </div>
  );
}
