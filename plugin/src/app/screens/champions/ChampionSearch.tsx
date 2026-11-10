import { useT } from '../../i18n/I18nProvider';
import { TextInput } from '../../ui/TextInput';

export interface ChampionSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ChampionSearch({ value, onChange }: ChampionSearchProps) {
  const t = useT();
  return (
    <div className="drk-champ-search">
      <TextInput
        type="search"
        value={value}
        placeholder={t('champions.search')}
        ariaLabel={t('champions.search')}
        onChange={onChange}
      />
    </div>
  );
}
