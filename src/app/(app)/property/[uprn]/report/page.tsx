import { PackEditor } from '@/components/PackEditor';

export default async function Report({ params }: { params: Promise<{ uprn: string }> }) {
  const { uprn } = await params;
  return <PackEditor uprn={uprn} />;
}
