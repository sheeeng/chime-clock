import type { ReactNode } from 'react';
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
  return (
    <div className="flex flex-col items-center mt-5 first:mt-0">
      <div className="flex items-center gap-2 mb-3 text-zinc-500 dark:text-zinc-400">
        {icon}
        <span className="font-semibold uppercase tracking-widest text-xs">
          {title}
        </span>
      </div>
      <div className="relative flex flex-wrap justify-center bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl p-1.5 w-full sm:w-auto border border-zinc-200 dark:border-zinc-700">
        {options.map((option) => (
          <motion.button
            key={option.value}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
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
