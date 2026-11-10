import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormat, useT } from '../../i18n/I18nProvider';
import { useLegacyActions } from '../../shell/LegacyActions';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Tabs } from '../../ui/Tabs';
import { DEFAULT_FILTERS, EMPTY_TOTALS, LOOT_CATEGORIES, buildPlan, filterLoot, planTotals } from '../../../features/loot';
import type {
  DisenchantEntry,
  DisenchantFailure,
  DisenchantProgress,
  DisenchantResult,
  EssenceTotals,
  LootCategory,
  LootFilters,
  LootItem,
} from '../../../features/loot';
import { EssenceIcon } from './Essence';
import { LootGrid, LootGridSkeleton } from './LootGrid';
import { SelectionTree } from './SelectionTree';
import { LootFiltersBar } from './LootFiltersBar';

type LoadState = { status: 'loading' } | { status: 'ready'; items: LootItem[] } | { status: 'error' };

type Phase =
  | { step: 'browse' }
  | { step: 'confirm'; plan: DisenchantEntry[] }
  | { step: 'running'; plan: DisenchantEntry[]; progress: DisenchantProgress | null; cancelling: boolean }
  | { step: 'result'; result: DisenchantResult };

const BROWSE: Phase = { step: 'browse' };

function failedRun(plan: readonly DisenchantEntry[]): DisenchantResult {
  return {
    done: [],
    failed: plan.map((entry): DisenchantFailure => ({ ...entry, reason: 'network' })),
    skipped: [],
    cancelled: false,
    gained: { ...EMPTY_TOTALS },
    inventory: null,
  };
}

function EssenceTotalsView({ totals }: { totals: EssenceTotals }) {
  const t = useT();
  const format = useFormat();
  return (
    <div className="drk-loot-totals">
      <span className="drk-loot-totals__item is-blue" data-essence="blue">
        <EssenceIcon essence="blue" />
        <strong>{format.number(totals.blue)}</strong>
        <span>{t('overlays.loot.essence.blue')}</span>
      </span>
      <span className="drk-loot-totals__item is-orange" data-essence="orange">
        <EssenceIcon essence="orange" />
        <strong>{format.number(totals.orange)}</strong>
        <span>{t('overlays.loot.essence.orange')}</span>
      </span>
    </div>
  );
}

function ConfirmStep({
  plan,
  onBack,
  onRun,
  onRemove,
}: {
  plan: DisenchantEntry[];
  onBack: () => void;
  onRun: () => void;
  onRemove: (lootId: string) => void;
}) {
  const t = useT();
  const totals = planTotals(plan);
  return (
    <div className="drk-loot-step drk-loot-confirm">
      <p className="drk-help">{t('overlays.loot.confirm.summary', { count: totals.copies })}</p>
      <SelectionTree plan={plan} onRemove={onRemove} />
      <div className="drk-loot-confirm__gain">
        <span className="drk-field__label">{t('overlays.loot.confirm.gain')}</span>
        <EssenceTotalsView totals={totals} />
      </div>
      <p className="drk-help is-warn">{t('overlays.loot.confirm.warning')}</p>
      <div className="drk-actions">
        <Button variant="secondary" onClick={onBack}>
          {t('overlays.loot.confirm.back')}
        </Button>
        <span className="drk-actions__spacer" />
        <Button variant="danger" onClick={onRun}>
          {t('overlays.loot.confirm.go')}
        </Button>
      </div>
    </div>
  );
}

function RunningStep({
  plan,
  progress,
  cancelling,
  onCancel,
}: {
  plan: DisenchantEntry[];
  progress: DisenchantProgress | null;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const t = useT();
  const total = plan.length;
  const current = progress ? progress.index + 1 : 0;
  const pct = total ? Math.round((current / total) * 100) : 0;
  return (
    <div className="drk-loot-step drk-loot-run">
      <p className="drk-loot-run__count">{t('overlays.loot.running.progress', { current, total })}</p>
      <div
        className="drk-loot-run__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={t('overlays.loot.running.title')}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="drk-help drk-loot-run__current">
        {progress ? t('overlays.loot.running.current', { name: progress.item.name }) : t('common.loading')}
      </p>
      <div className="drk-actions">
        <span className="drk-actions__spacer" />
        <Button variant="danger" disabled={cancelling} onClick={onCancel}>
          {t(cancelling ? 'overlays.loot.running.stopping' : 'overlays.loot.running.stop')}
        </Button>
      </div>
    </div>
  );
}

function ResultStep({ result, onBack, onClose }: { result: DisenchantResult; onBack: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <div className="drk-loot-step drk-loot-result">
      <p className="drk-help is-info">{t('overlays.loot.result.disenchanted', { count: result.done.length })}</p>
      {result.cancelled ? <p className="drk-help is-warn">{t('overlays.loot.result.cancelled', { count: result.skipped.length })}</p> : null}
      <div className="drk-loot-confirm__gain">
        <span className="drk-field__label">{t('overlays.loot.result.gained')}</span>
        <EssenceTotalsView totals={result.gained} />
      </div>
      {result.failed.length ? (
        <>
          <p className="drk-help is-warn">{t('overlays.loot.result.failed', { count: result.failed.length })}</p>
          <ul className="drk-loot-result__failures">
            {result.failed.map((failure) => (
              <li key={failure.item.lootId}>
                <span>{failure.item.name}</span>
                <span className="drk-loot-result__reason">
                  {t(`overlays.loot.result.reasons.${failure.reason}`, { status: failure.status ?? '?' })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!result.inventory ? <p className="drk-help is-warn">{t('overlays.loot.result.refreshFailed')}</p> : null}
      <div className="drk-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
        <span className="drk-actions__spacer" />
        <Button onClick={onBack}>{t('overlays.loot.result.back')}</Button>
      </div>
    </div>
  );
}

export interface DisenchantModalProps {
  open: boolean;
  onClose: () => void;
}

export function DisenchantModal({ open, onClose }: DisenchantModalProps) {
  const t = useT();
  const actions = useLegacyActions();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [phase, setPhase] = useState<Phase>(BROWSE);
  const [tab, setTab] = useState<LootCategory>('champion');
  const [filters, setFilters] = useState<Record<LootCategory, LootFilters>>(DEFAULT_FILTERS);
  const [keepOne, setKeepOne] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoad({ status: 'loading' });
    actions.loadLoot().then(
      (items) => {
        if (requestRef.current === request) setLoad({ status: 'ready', items });
      },
      () => {
        if (requestRef.current === request) setLoad({ status: 'error' });
      },
    );
  }, [actions]);

  useEffect(() => {
    if (!open) return;
    setPhase(BROWSE);
    setSelected(new Set());
    reload();
  }, [open, reload]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const items = load.status === 'ready' ? load.items : [];
  const visible = useMemo(
    () => ({
      champion: filterLoot(items, 'champion', filters.champion, keepOne),
      skin: filterLoot(items, 'skin', filters.skin, keepOne),
    }),
    [items, filters, keepOne],
  );
  const plan = useMemo(
    () => buildPlan([...visible.champion, ...visible.skin].filter((item) => selected.has(item.lootId)), keepOne),
    [visible, selected, keepOne],
  );
  const totals = useMemo(() => planTotals(plan), [plan]);
  const shown = visible[tab];

  const toggle = useCallback((lootId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lootId)) next.delete(lootId);
      else next.add(lootId);
      return next;
    });
  }, []);

  const selectShown = () => setSelected((prev) => new Set([...prev, ...shown.map((item) => item.lootId)]));
  const clearSelection = () => setSelected(new Set());
  const patchFilters = (patch: Partial<LootFilters>) => setFilters((prev) => ({ ...prev, [tab]: { ...prev[tab], ...patch } }));

  const run = async (runPlan: DisenchantEntry[]) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase({ step: 'running', plan: runPlan, progress: null, cancelling: false });
    let result: DisenchantResult;
    try {
      result = await actions.disenchantLoot(runPlan, {
        signal: controller.signal,
        onProgress: (progress) => setPhase((prev) => (prev.step === 'running' ? { ...prev, progress } : prev)),
      });
    } catch {
      result = failedRun(runPlan);
    }
    controllerRef.current = null;
    if (result.inventory) setLoad({ status: 'ready', items: result.inventory });
    setSelected(new Set());
    setPhase({ step: 'result', result });
  };

  const removeFromConfirm = (lootId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(lootId);
      return next;
    });
    setPhase((prev) => {
      if (prev.step !== 'confirm') return prev;
      const plan = prev.plan.filter((entry) => entry.item.lootId !== lootId);
      return plan.length ? { ...prev, plan } : BROWSE;
    });
  };

  const cancel = () => {
    controllerRef.current?.abort();
    setPhase((prev) => (prev.step === 'running' ? { ...prev, cancelling: true } : prev));
  };

  const backToInventory = () => {
    const missing = phase.step === 'result' && !phase.result.inventory;
    setPhase(BROWSE);
    if (missing) reload();
  };

  const header =
    phase.step === 'browse' ? (
      <div className="drk-loot__head">
        <h2 className="drk-modal__title">{t('overlays.loot.title')}</h2>
        <Tabs
          tabs={LOOT_CATEGORIES.map((id) => ({ id, label: t(`overlays.loot.tabs.${id}`) }))}
          value={tab}
          onChange={setTab}
        />
      </div>
    ) : undefined;

  const title =
    phase.step === 'confirm'
      ? t('overlays.loot.confirm.title')
      : phase.step === 'running'
        ? t('overlays.loot.running.title')
        : phase.step === 'result'
          ? t('overlays.loot.result.title')
          : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      header={header}
      title={title}
      ariaLabel={t('overlays.loot.title')}
      width={980}
      className="drk-loot"
      dismissible={phase.step !== 'running'}
    >
      {phase.step === 'confirm' ? (
        <ConfirmStep plan={phase.plan} onBack={() => setPhase(BROWSE)} onRun={() => void run(phase.plan)} onRemove={removeFromConfirm} />
      ) : phase.step === 'running' ? (
        <RunningStep plan={phase.plan} progress={phase.progress} cancelling={phase.cancelling} onCancel={cancel} />
      ) : phase.step === 'result' ? (
        <ResultStep result={phase.result} onBack={backToInventory} onClose={onClose} />
      ) : (
        <div className="drk-loot-step drk-loot-browse">
          <LootFiltersBar
            category={tab}
            filters={filters[tab]}
            keepOne={keepOne}
            onChange={patchFilters}
            onKeepOne={setKeepOne}
          />
          <div className="drk-loot-toolbar">
            <span className="drk-loot-toolbar__count">{t('overlays.loot.selected', { count: plan.length })}</span>
            <span className="drk-actions__spacer" />
            <Button variant="ghost" size="sm" disabled={load.status !== 'ready' || !shown.length} onClick={selectShown}>
              {t('overlays.loot.selectAll')}
            </Button>
            <Button variant="ghost" size="sm" disabled={!selected.size} onClick={clearSelection}>
              {t('overlays.loot.clear')}
            </Button>
          </div>
          {load.status === 'loading' ? (
            <LootGridSkeleton />
          ) : load.status === 'error' ? (
            <div className="drk-loot-empty" role="alert">
              <p className="drk-help is-warn">{t('overlays.loot.error')}</p>
              <Button variant="secondary" size="sm" onClick={reload}>
                {t('common.retry')}
              </Button>
            </div>
          ) : shown.length ? (
            <LootGrid items={shown} selected={selected} keepOne={keepOne} onToggle={toggle} />
          ) : (
            <div className="drk-loot-empty">
              <p className="drk-help">{t(items.length ? 'overlays.loot.empty' : 'overlays.loot.emptyInventory')}</p>
            </div>
          )}
          <footer className="drk-loot-summary">
            <EssenceTotalsView totals={totals} />
            <span className="drk-actions__spacer" />
            <Button disabled={!plan.length} onClick={() => setPhase({ step: 'confirm', plan })}>
              {t('overlays.loot.disenchant')}
            </Button>
          </footer>
        </div>
      )}
    </Modal>
  );
}
