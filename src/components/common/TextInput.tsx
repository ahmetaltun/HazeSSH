import React, { forwardRef } from "react";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Reusable, desktop-optimized text input component.
 *
 * Automatically suppresses browser and macOS WebKit automatic text replacements,
 * auto-capitalization of words, spellchecking red underlines, and unwanted autocomplete popups,
 * which are disruptive in terminal/SSH developer environments.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      autoComplete = "off",
      autoCorrect = "off",
      autoCapitalize = "none",
      spellCheck = false,
      type = "text",
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <input
        ref={ref}
        type={type}
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

TextInput.displayName = "TextInput";
