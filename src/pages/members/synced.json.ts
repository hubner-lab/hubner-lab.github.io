import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// { "<uid>": "<rev>" } for every team entry the member-card sync wrote. The /members page compares
// a card's published `rev` with this to tell "approved" from "live on the site".
export const GET: APIRoute = async () => {
  const entries = await getCollection('team');
  const synced: Record<string, string> = {};
  for (const { data } of entries) {
    if (data.uid) synced[data.uid] = data.rev ?? '';
  }
  return new Response(JSON.stringify(synced), {
    headers: { 'Content-Type': 'application/json' },
  });
};
