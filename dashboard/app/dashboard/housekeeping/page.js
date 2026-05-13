import { DepartmentTicketsView } from '@/components/DepartmentTicketsView';

export const dynamic = 'force-dynamic';

export default function HousekeepingPage() {
  return (
    <DepartmentTicketsView
      eyebrow="Department"
      title="Housekeeping"
      titleKey="sidebar.housekeeping"
      descriptionKey="screens.departmentDescription"
      description="Operational requests for towels, cleaning, linens, pillows and room amenities."
      categories={['housekeeping']}
    />
  );
}
