import { PageHeader } from '../dashboard/PageHeader.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';
import { Select } from '../ui/Field.jsx';
import { SearchInput } from '../ui/FilterBar.jsx';

export function ChequesPageHeader({
  t,
  i18n,
  user,
  statusTab,
  isCrossTab,
  venues,
  venueId,
  searchQ,
  onSearchChange,
  onTabChange,
  onVenueChange,
}) {
  return (
    <PageHeader
      title={t('cheque.title')}
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <SegmentedControl
            options={[
              { value: 'open', label: t('cheque.tabOpen') },
              { value: 'paid', label: t('cheque.tabPaid') },
              { value: 'cross_sell', label: t('cheque.tabCrossSell') },
            ]}
            value={statusTab}
            onChange={onTabChange}
          />
          {!isCrossTab && user?.role === 'hub_manager' && venues.length >= 1 ? (
            <Select className="w-full py-2 sm:w-auto" value={venueId} onChange={(e) => onVenueChange(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                </option>
              ))}
            </Select>
          ) : null}
          {!isCrossTab ? (
            <SearchInput
              value={searchQ}
              onChange={onSearchChange}
              placeholder={t('cheque.searchPlaceholder')}
              className="w-full sm:w-52"
            />
          ) : null}
        </div>
      }
    />
  );
}
