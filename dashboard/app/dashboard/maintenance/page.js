import { DepartmentTicketsView } from '@/components/DepartmentTicketsView';

export const dynamic = 'force-dynamic';

export default function MaintenancePage() {
  return (
    <DepartmentTicketsView
      eyebrow="Department"
      title="Maintenance"
      titleKey="sidebar.maintenance"
      descriptionKey="screens.departmentDescription"
      description="Technical incidents for air conditioning, water, shower, lights, TV and urgent maintenance issues."
      categories={['maintenance', 'emergency']}
    />
  );
}
