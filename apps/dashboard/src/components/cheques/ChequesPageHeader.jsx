import { PageHeader } from '../dashboard/PageHeader.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';
import { Select } from '../ui/Field.jsx';

export function ChequesPageHeader({
  t,
  i18n,
  user,
  statusTab,
  venues,
  venueId,
  onTabChange,
  onVenueChange,
}) {
  return (
    <PageHeader
      title={t('cheque.title')}
      actions={
        <>
          <SegmentedControl
            options={[
              { value: 'open', label: t('cheque.tabOpen') },
              { value: 'paid', label: t('cheque.tabPaid') },
            ]}
            value={statusTab}
            onChange={onTabChange}
          />
          {user?.role === 'hub_manager' && venues.length >= 1 ? (
            <Select className="w-auto py-2" value={venueId} onChange={(e) => onVenueChange(e.target.value)}>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {i18n.language === 'ar' ? v.nameAr : v.nameEn}
                </option>
              ))}
            </Select>
          ) : null}
        </>
      }
    />
  );
}
