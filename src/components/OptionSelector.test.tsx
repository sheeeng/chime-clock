import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OptionSelector } from './OptionSelector';

const options = [
  { value: 'off', label: 'Off' },
  { value: 'bell', label: 'Bell' },
  { value: 'cuckoo', label: 'Cuckoo' },
] as const;

function renderSelector(
  overrides: {
    onChange?: (value: 'off' | 'bell' | 'cuckoo') => void;
    title?: string;
    value?: 'off' | 'bell' | 'cuckoo';
  } = {},
) {
  const onChange = overrides.onChange ?? vi.fn();

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
});
