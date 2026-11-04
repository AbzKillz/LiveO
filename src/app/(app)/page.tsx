import { Finder } from '@/components/Finder';

export default async function Home({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  return <Finder initialDistrict={d} />;
}
