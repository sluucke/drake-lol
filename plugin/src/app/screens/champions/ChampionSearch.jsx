import { useT } from '../../i18n/I18nProvider.jsx';
import { TextInput } from '../../ui/TextInput.jsx';

export function ChampionSearch({ value, onChange }) {
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
