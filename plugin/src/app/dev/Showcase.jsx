import { useEffect, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Select } from '../ui/Select.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { Slider } from '../ui/Slider.jsx';
import { Tabs } from '../ui/Tabs.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

const SHOWCASE_CSS = `
.drk-showcase { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.drk-showcase__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
`;

const REGIONS = [
  { value: 'na1', label: 'North America' },
  { value: 'br1', label: 'Brazil' },
  { value: 'euw1', label: 'Europe West' },
];

const TABS = [
  { id: 'scouting', label: 'Team Scouting' },
  { id: 'build', label: 'Build' },
];

export function matchesShowcaseToggle(event) {
  return !!event.ctrlKey && !!event.shiftKey && event.key === 'F12';
}

export function Showcase() {
  const [on, setOn] = useState(true);
  const [region, setRegion] = useState('br1');
  const [tab, setTab] = useState('scouting');
  const [delay, setDelay] = useState(2000);
  return (
    <div className="drk-showcase">
      <style>{SHOWCASE_CSS}</style>
      <Card title="Buttons">
        <div className="drk-showcase__row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>
      <Card title="Inputs" glow>
        <Toggle checked={on} onChange={setOn} label="Auto accept" help="Accepts the ready check for you" />
        <Select value={region} options={REGIONS} onChange={setRegion} ariaLabel="Region" />
        <Slider value={delay} min={0} max={10000} step={500} onChange={setDelay} ariaLabel="Delay" format={(v) => `${v / 1000}s`} />
      </Card>
      <Card title="Navigation">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <Tooltip content="Hextech tooltip">
          <Button variant="ghost">Hover me</Button>
        </Tooltip>
      </Card>
      <Card title="Loading">
        <Skeleton width="60%" />
        <Skeleton width="90%" />
        <Skeleton variant="circle" width={40} />
      </Card>
    </div>
  );
}

export function DevShowcase() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!matchesShowcaseToggle(event)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Design system" width={760}>
      <Showcase />
    </Modal>
  );
}
