import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OptionSelector } from './OptionSelector';

const options = [
  { value: 'off', label: 'Off' },
  { value: 'bell', label: 'Bell' },
  { value: 'cuckoo', label: 'Cuckoo' },
] as const;

function renderSelector(
  overrides: {
    title?: string;
    value?: 'off' | 'bell' | 'cuckoo';
  } = {},
) {
  const onChange = vi.fn<(value: 'off' | 'bell' | 'cuckoo') => void>();

  render(
    <OptionSelector
      layoutId="test-active"
      onChange={onChange}
      options={options}
      title={overrides.title ?? 'Chime Sound'}
      value={overrides.value ?? 'bell'}
    />,
  );

  return { onChange };
}

function pressKey(label: string, key: string) {
  fireEvent.keyDown(screen.getByRole('radio', { name: label }), { key });
}

describe('OptionSelector', () => {
  it('exposes a group named by its visible title', () => {
    renderSelector({ title: 'Background' });

    expect(
      screen.getByRole('radiogroup', { name: 'Background' }),
    ).toBeInTheDocument();
  });

  it('offers one radio per option in the given order', () => {
    renderSelector();

    const group = screen.getByRole('radiogroup', { name: 'Chime Sound' });

    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Off', 'Bell', 'Cuckoo']);
  });

  it('checks the selected option and leaves the rest unchecked', () => {
    renderSelector({ value: 'cuckoo' });

    const group = screen.getByRole('radiogroup', { name: 'Chime Sound' });

    expect(within(group).getByRole('radio', { name: 'Cuckoo' })).toBeChecked();
    expect(
      within(group).getByRole('radio', { name: 'Off' }),
    ).not.toBeChecked();
    expect(
      within(group).getByRole('radio', { name: 'Bell' }),
    ).not.toBeChecked();
  });

  it('reports the chosen value', () => {
    const { onChange } = renderSelector();

    fireEvent.click(screen.getByRole('radio', { name: 'Cuckoo' }));

    expect(onChange).toHaveBeenCalledWith('cuckoo');
  });

  it('keeps a choice from reaching a clickable ancestor', () => {
    const onOuterClick = vi.fn();
    const onChange = vi.fn();

    render(
      <div onClick={onOuterClick}>
        <OptionSelector
          layoutId="test-active"
          onChange={onChange}
          options={options}
          title="Chime Sound"
          value="bell"
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));

    expect(onChange).toHaveBeenCalledWith('off');
    expect(onOuterClick).not.toHaveBeenCalled();
  });

  it('keeps the selected option marked for the eye as well', () => {
    renderSelector({ value: 'bell' });

    expect(screen.getByRole('radio', { name: 'Bell' })).toHaveClass(
      'text-zinc-900',
    );
  });

  it('does not submit a surrounding form', () => {
    renderSelector();

    screen.getAllByRole('radio').forEach((radio) => {
      expect(radio).toHaveAttribute('type', 'button');
    });
  });

  describe('keyboard interaction', () => {
    /**
     * A radio group selects as focus moves, so each move changes the value
     * the next move starts from. These cases drive a controlled harness for
     * that reason: a fixed `value` prop would make the second move in a case
     * land back on the option that is still marked current.
     */
    function renderControlled(initial: 'off' | 'bell' | 'cuckoo' = 'bell') {
      const onChange = vi.fn<(value: 'off' | 'bell' | 'cuckoo') => void>();

      function Harness() {
        const [value, setValue] = useState(initial);

        return (
          <OptionSelector
            layoutId="test-active"
            onChange={(next) => {
              onChange(next);
              setValue(next);
            }}
            options={options}
            title="Chime Sound"
            value={value}
          />
        );
      }

      render(<Harness />);

      return { onChange };
    }

    it('gives the group one tab stop and puts it on the checked option', () => {
      renderSelector({ value: 'cuckoo' });

      expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveAttribute(
        'tabindex',
        '0',
      );
    });

    it('keeps a tab stop when the value matches no option', () => {
      render(
        <OptionSelector
          layoutId="test-active"
          onChange={vi.fn()}
          options={options}
          title="Chime Sound"
          value={'gong' as 'off'}
        />,
      );

      expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute(
        'tabindex',
        '0',
      );
    });

    it('moves forward and selects with the right and down arrows', () => {
      const { onChange } = renderControlled('off');

      pressKey('Off', 'ArrowRight');

      expect(onChange).toHaveBeenLastCalledWith('bell');
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveFocus();

      pressKey('Bell', 'ArrowDown');

      expect(onChange).toHaveBeenLastCalledWith('cuckoo');
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toBeChecked();
    });

    it('moves backward and selects with the left and up arrows', () => {
      const { onChange } = renderControlled('cuckoo');

      pressKey('Cuckoo', 'ArrowLeft');

      expect(onChange).toHaveBeenLastCalledWith('bell');
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveFocus();

      pressKey('Bell', 'ArrowUp');

      expect(onChange).toHaveBeenLastCalledWith('off');
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    });

    it('wraps from the last option to the first and back', () => {
      const { onChange } = renderControlled('cuckoo');

      pressKey('Cuckoo', 'ArrowRight');

      expect(onChange).toHaveBeenLastCalledWith('off');
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();

      pressKey('Off', 'ArrowLeft');

      expect(onChange).toHaveBeenLastCalledWith('cuckoo');
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toBeChecked();
    });

    it('selects the first option with Home and the last with End', () => {
      const { onChange } = renderControlled('bell');

      pressKey('Bell', 'End');

      expect(onChange).toHaveBeenLastCalledWith('cuckoo');
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveFocus();

      pressKey('Cuckoo', 'Home');

      expect(onChange).toHaveBeenLastCalledWith('off');
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    });

    it('moves the tab stop with the choice', () => {
      renderControlled('bell');

      pressKey('Bell', 'ArrowRight');

      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveAttribute(
        'tabindex',
        '0',
      );
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    });

    it('moves focus without reporting a value already chosen', () => {
      const { onChange } = renderControlled('off');

      pressKey('Off', 'Home');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();
    });

    it('leaves other keys to the browser', () => {
      const { onChange } = renderControlled('bell');

      pressKey('Bell', 'Tab');
      pressKey('Bell', 'a');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Bell' })).toBeChecked();
    });

    it('still reports a choice made with Enter or Space', async () => {
      const user = userEvent.setup();
      const { onChange } = renderControlled('bell');

      // A button turns both keys into a click, so the handler must leave
      // them alone rather than cancel them along with the arrows.
      screen.getByRole('radio', { name: 'Bell' }).focus();
      await user.keyboard('{Enter}');

      expect(onChange).toHaveBeenLastCalledWith('bell');

      await user.keyboard(' ');

      expect(onChange).toHaveBeenLastCalledWith('bell');
      expect(screen.getByRole('radio', { name: 'Bell' })).toBeChecked();
    });
  });

  describe('manual activation', () => {
    /**
     * Manual activation is for an option whose commit is expensive or
     * privacy relevant, so arrowing through the group must never call
     * `onChange`. Only a click, `Enter`, or `Space` may report a value, so
     * these cases use a controlled harness the same way the automatic
     * keyboard cases do, and assert the reported value once a commit is
     * made rather than after every move.
     */
    function renderManual(initial: 'off' | 'bell' | 'cuckoo' = 'off') {
      const onChange = vi.fn<(value: 'off' | 'bell' | 'cuckoo') => void>();

      function Harness() {
        const [value, setValue] = useState(initial);

        return (
          <OptionSelector
            activation="manual"
            layoutId="test-active"
            onChange={(next) => {
              onChange(next);
              setValue(next);
            }}
            options={options}
            title="Chime Sound"
            value={value}
          />
        );
      }

      render(<Harness />);

      return { onChange };
    }

    it('moves focus without reporting on the arrow keys', () => {
      const { onChange } = renderManual('off');

      pressKey('Off', 'ArrowRight');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();

      pressKey('Bell', 'ArrowLeft');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    });

    it('moves focus without reporting on Home, End, and a wrap', () => {
      const { onChange } = renderManual('bell');

      pressKey('Bell', 'End');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveFocus();

      pressKey('Cuckoo', 'ArrowRight');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();

      pressKey('Off', 'Home');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Bell' })).toBeChecked();
    });

    it('keeps the tab stop on the committed option while focus moves past it', () => {
      renderManual('bell');

      pressKey('Bell', 'ArrowRight');

      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveAttribute(
        'tabindex',
        '0',
      );
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    });

    it('commits the focused option with a pointer click', () => {
      const { onChange } = renderManual('off');

      pressKey('Off', 'ArrowRight');
      fireEvent.click(screen.getByRole('radio', { name: 'Bell' }));

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith('bell');
      expect(screen.getByRole('radio', { name: 'Bell' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveAttribute(
        'tabindex',
        '0',
      );
    });

    it('commits the focused option with Enter or Space', async () => {
      const user = userEvent.setup();
      const { onChange } = renderManual('off');

      pressKey('Off', 'End');
      await user.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith('cuckoo');
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toBeChecked();
    });

    it('follows the tab stop to a value changed from outside the widget', () => {
      const onChange = vi.fn();

      const { rerender } = render(
        <OptionSelector
          activation="manual"
          layoutId="test-active"
          onChange={onChange}
          options={options}
          title="Chime Sound"
          value="off"
        />,
      );

      pressKey('Off', 'ArrowRight');

      expect(screen.getByRole('radio', { name: 'Bell' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute(
        'tabindex',
        '0',
      );

      rerender(
        <OptionSelector
          activation="manual"
          layoutId="test-active"
          onChange={onChange}
          options={options}
          title="Chime Sound"
          value="cuckoo"
        />,
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Cuckoo' })).toHaveAttribute(
        'tabindex',
        '0',
      );
      expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    });

    it('leaves unhandled keys to the browser', () => {
      const { onChange } = renderManual('bell');

      pressKey('Bell', 'a');

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Bell' })).toBeChecked();
    });
  });
});
