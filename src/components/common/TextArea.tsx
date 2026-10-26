import React, { forwardRef } from "react";

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Reusable, desktop-optimized textarea component.
 *
 * Automatically suppresses browser and macOS WebKit automatic text replacements,
 * auto-capitalization of words, spellchecking red underlines, and unwanted autocomplete popups,
 * ensuring scripts, keys, and configurations remain exactly as typed.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      autoComplete = "off",
      autoCorrect = "off",
      autoCapitalize = "none",
      spellCheck = false,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <textarea
        ref={ref}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        spellCheck={spellCheck}
        className={className}
        {...props}
      />
    );
  }
);

TextArea.displayName = "TextArea";
