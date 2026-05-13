import { DepartmentTicketsView } from '@/components/DepartmentTicketsView';

export const dynamic = 'force-dynamic';

export default function ReceptionPage() {
  return (
    <DepartmentTicketsView
      eyebrow="Department"
      title="Reception"
      titleKey="sidebar.reception"
      descriptionKey="screens.departmentDescription"
      description="Guest-facing operations for transport, restaurant, spa, room service, complaints, emergencies and general support."
      categories={['transport', 'restaurant', 'spa', 'room_service', 'reception', 'complaint', 'emergency']}
    />
  );
}
