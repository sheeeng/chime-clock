import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';

type OptionValue = number | string;

type Option<T extends OptionValue> = {
  label: string;
  value: T;
};

type OptionSelectorProps<T extends OptionValue> = {
  icon?: ReactNode;
  layoutId: string;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  title: string;
  value: T;
};

export function OptionSelector<T extends OptionValue>({
  icon,
  layoutId,
  onChange,
  options,
  title,
  value,
}: OptionSelectorProps<T>) {
  // The visible title names the group, so assistive technology announces the
  // same words the eye reads rather than a second, invisible wording.
  const titleId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const checkedIndex = options.findIndex((option) => option.value === value);
  // A radio group holds one tab stop. The checked option owns it, so tabbing
  // in lands on the current choice. When no option matches the value, the
  // first one owns it instead, so the group never drops out of the tab order.
  const tabbableIndex = checkedIndex === -1 ? 0 : checkedIndex;

  function selectAt(index: number) {
    const option = options[index];

    if (!option) return;

    // Focus moves first so the reader announces the option it lands on, then
    // the choice is reported. A radio group selects on arrival, so moving and
    // choosing are the same action.
    optionRefs.current[index]?.focus();

    if (option.value !== value) {
      onChange(option.value);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const count = options.length;

    if (count === 0) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        selectAt((index + 1) % count);
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        selectAt((index - 1 + count) % count);
        return;
      case 'Home':
        event.preventDefault();
        selectAt(0);
        return;
      case 'End':
        event.preventDefault();
        selectAt(count - 1);
        return;
      default:
        return;
    }
  }

  return (
    <div className="flex flex-col items-center mt-5 first:mt-0">
      <div className="flex items-center gap-2 mb-3 text-zinc-500 dark:text-zinc-400">
        {icon}
        <span
          id={titleId}
          className="font-semibold uppercase tracking-widest text-xs"
        >
          {title}
        </span>
      </div>
      <div
        aria-labelledby={titleId}
        role="radiogroup"
        className="relative flex flex-wrap justify-center bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl p-1.5 w-full sm:w-auto border border-zinc-200 dark:border-zinc-700"
      >
        {options.map((option, index) => (
          <motion.button
            key={option.value}
            ref={(element: HTMLButtonElement | null) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            tabIndex={index === tabbableIndex ? 0 : -1}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option.value);
            }}
            className={`relative flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 z-10 ${
              value === option.value
                ? 'text-zinc-900 dark:text-white'
                : 'text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50'
            }`}
          >
            {value === option.value && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                transition={{
                  type: 'spring',
                  bounce: 0.2,
                  duration: 0.6,
                }}
                style={{ zIndex: -1 }}
              />
            )}
            {option.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
