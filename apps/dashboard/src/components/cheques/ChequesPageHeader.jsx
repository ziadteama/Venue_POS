import { PageHeader } from '../dashboard/PageHeader.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';
import { Select } from '../ui/Field.jsx';
import { SearchInput } from '../ui/FilterBar.jsx';

export function ChequesPageHeader({
  t,
  i18n,
  user,
  statusTab,
  crossGroupStatus,
  onCrossGroupStatusChange,
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
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={[
              { value: 'open', label: t('cheque.tabOpen') },
              { value: 'paid', label: t('cheque.tabPaid') },
              { value: 'cross_sell', label: t('cheque.tabCrossSell') },
            ]}
            value={statusTab}
            onChange={onTabChange}
          />
          {isCrossTab ? (
            <SegmentedControl
              options={[
                { value: 'open', label: t('cheque.tabOpen') },
                { value: 'paid', label: t('cheque.tabPaid') },
              ]}
              value={crossGroupStatus}
              onChange={onCrossGroupStatusChange}
            />
          ) : null}
          {!isCrossTab && user?.role === 'hub_manager' && venues.length >= 1 ? (
            <Select className="w-auto py-2" value={venueId} onChange={(e) => onVenueChange(e.target.value)}>
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
              className="w-48"
            />
          ) : null}
        </div>
      }
    />
  );
}
