import { headers } from 'next/headers';
export async function currentUser(): Promise<string | undefined> {
  return (await headers()).get('x-user-email') ?? undefined;
}
