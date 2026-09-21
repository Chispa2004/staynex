import { OrganizationDirectoryClient } from '@/components/OrganizationDirectoryClient';
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const organizationId = typeof params?.organizationId === 'string' ? params.organizationId : '';
  return <OrganizationDirectoryClient platform key={organizationId} initialOrganizationId={organizationId} />;
}
