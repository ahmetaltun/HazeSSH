import React, { forwardRef, useRef, useImperativeHandle } from "react";
import { Search, X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Size variant matching DaisyUI size tokens */
  inputSize?: "xs" | "sm" | "md" | "lg";
  /** Callback fired when the clear button is clicked or Escape is pressed with text */
  onClear?: () => void;
  /** Explicit control to show/hide the clear button when input has text (defaults to true if onClear is provided) */
  showClearButton?: boolean;
  /** Custom icon to render on the left (defaults to Lucide Search) */
  leftIcon?: React.ReactNode;
  /** Additional element on the right (e.g. keyboard shortcut kbd, badge) */
  rightElement?: React.ReactNode;
  /** Additional classes applied to the outer container (label) */
  containerClassName?: string;
  /** Additional classes applied to the inner input element */
  inputClassName?: string;
}

/**
 * Reusable, desktop-optimized search input component.
 *
 * Implements DaisyUI 5's idiomatic <label className="input"> flex pattern,
 * eliminating CSS stacking context issues where absolutely-positioned icons
 * are obscured behind relatively-positioned input elements.
 *
 * Automatically suppresses browser and macOS WebKit automatic text replacements,
 * auto-capitalization, and unwanted spellchecking, ensuring developer queries
 * remain exact.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      inputSize = "sm",
      onClear,
      showClearButton,
      leftIcon,
      rightElement,
      containerClassName,
      inputClassName,
      className,
      value,
      onChange,
      onKeyDown,
      placeholder = "Search...",
      disabled,
      autoComplete = "off",
      autoCorrect = "off",
      autoCapitalize = "none",
      spellCheck = false,
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const sizeClass = {
      xs: "input-xs text-xs px-2 gap-1.5",
      sm: "input-sm text-xs px-2.5 gap-2",
      md: "input-md text-sm px-3 gap-2.5",
      lg: "input-lg text-base px-4 gap-3",
    }[inputSize];

    const iconSizeClass = {
      xs: "w-3 h-3",
      sm: "w-3.5 h-3.5",
      md: "w-4 h-4",
      lg: "w-5 h-5",
    }[inputSize];

    const hasValue = value !== undefined && value !== null && String(value).length > 0;
    const canClear = (showClearButton ?? Boolean(onClear)) && hasValue && !disabled;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape" && hasValue && onClear) {
        e.preventDefault();
        e.stopPropagation();
        onClear();
      }
      onKeyDown?.(e);
    };

    return (
      <label
        className={cn(
          "input flex items-center rounded-lg bg-base-100 border border-base-300 focus-within:border-primary transition-colors cursor-text",
          sizeClass,
          disabled && "opacity-50 cursor-not-allowed",
          containerClassName,
          className
        )}
      >
        {leftIcon !== undefined ? (
          leftIcon
        ) : (
          <Search className={cn(iconSizeClass, "text-base-content/40 shrink-0 pointer-events-none")} />
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          autoCorrect={autoCorrect}
          autoCapitalize={autoCapitalize}
          spellCheck={spellCheck}
          className={cn(
            "grow min-w-0 bg-transparent border-none outline-none p-0 text-inherit placeholder:text-base-content/40 focus:outline-none focus:ring-0",
            inputClassName
          )}
          {...props}
        />
        {canClear && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear?.();
              inputRef.current?.focus();
            }}
            className="text-base-content/40 hover:text-base-content transition-colors shrink-0 p-0.5 rounded cursor-pointer"
            title="Clear search"
            tabIndex={-1}
          >
            <X className={inputSize === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />
          </button>
        )}
        {rightElement}
      </label>
    );
  }
);

SearchInput.displayName = "SearchInput";
