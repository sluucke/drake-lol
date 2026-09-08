const TAG = '[Drake]';

export function renderDrakeSelectHtml(id, options, selectedValue, { disabled = false, extraAttrs = {} } = {}) {
  const selected = options.find((o) => String(o.value) === String(selectedValue)) || options[0] || { value: '', label: '' };
  const attrs = Object.entries(extraAttrs)
    .map(([key, val]) => (val === true ? ` ${key}` : val == null || val === false ? '' : ` ${key}="${escapeHtml(String(val))}"`))
    .join('');

  const optionsHtml = options
    .map(
      (o) =>
        `<div class="drake-select-option${String(o.value) === String(selected.value) ? ' is-selected' : ''}" data-value="${escapeHtml(o.value)}" role="option">${escapeHtml(o.label)}</div>`,
    )
    .join('');

  return `<div class="drake-select select-field" id="${escapeHtml(id)}" data-value="${escapeHtml(selected.value)}" tabindex="0" role="listbox"${disabled ? ' aria-disabled="true"' : ''}${attrs}>
    <div class="drake-select-current">${escapeHtml(selected.label)}</div>
    <div class="drake-select-list">${optionsHtml}</div>
  </div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function closeAllDrakeSelects(root, exceptEl = null) {
  if (!root?.querySelectorAll) return;
  for (const select of root.querySelectorAll('.drake-select.is-open')) {
    if (select !== exceptEl) select.classList.remove('is-open');
  }
}

export function isDrakeSelectTarget(target) {
  return Boolean(target?.closest?.('.drake-select'));
}

function wireOneSelect(select, onSelect, root, cleanups) {
  if (select.dataset?.drakeSelectWired === '1') return;
  if (select.dataset) select.dataset.drakeSelectWired = '1';
  if (select.getAttribute?.('aria-disabled') === 'true') return;

  const current = select.querySelector('.drake-select-current');

  const onToggle = (event) => {
    event?.stopPropagation?.();
    const isOpen = select.classList.contains('is-open');
    closeAllDrakeSelects(root, select);
    select.classList.toggle('is-open', !isOpen);
  };
  current?.addEventListener('click', onToggle);
  cleanups.push(() => current?.removeEventListener('click', onToggle));

  for (const option of select.querySelectorAll('.drake-select-option')) {
    const onPick = (event) => {
      event?.stopPropagation?.();
      try {
        const value = option.dataset?.value ?? option.getAttribute?.('value') ?? '';
        const label = String(option.textContent || '').trim();
        if (value === '') return;

        select.value = value;
        select.setAttribute('data-value', value);
        if (current) current.textContent = label;
        for (const opt of select.querySelectorAll('.drake-select-option')) {
          opt.classList.toggle('is-selected', opt === option);
        }
        select.classList.remove('is-open');
        onSelect?.({ dropdown: select, value, label, event });
      } catch (err) {
        console.warn(TAG, 'drake-select option pick handler threw:', err?.stack || err?.message || err);
      }
    };
    option.addEventListener('click', onPick);
    cleanups.push(() => option.removeEventListener('click', onPick));
  }
}

export function wireDrakeSelects(root, onSelect) {
  if (!root?.querySelectorAll) return () => {};
  const cleanups = [];

  const found = root.querySelectorAll('.drake-select');
  let wired = 0;
  for (const select of found) {
    try {
      wireOneSelect(select, onSelect, root, cleanups);
      wired += 1;
    } catch (err) {
      console.warn(TAG, 'failed to wire a drake-select, skipping it:', err?.stack || err?.message || err);
    }
  }
  console.log(TAG, `wireDrakeSelects: found ${found.length}, wired ${wired}`);

  return () => {
    for (const dispose of cleanups) dispose();
  };
}
