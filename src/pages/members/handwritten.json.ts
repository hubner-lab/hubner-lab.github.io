import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildTeam } from '../../lib/team';

// Every team entry the member-card sync did not write (no `uid`): the files still kept by hand.
// The admin tab of /members offers them for adoption into a record an admin keeps. Nothing here
// is new information: the same people and texts are on the Team page and in the public repo.
export const GET: APIRoute = async () => {
  const { pis, current, alumni } = buildTeam(await getCollection('team'));
  const list = [...pis, ...current, ...alumni]
    .filter((p) => !p.uid)
    .map((p) => ({
      slug: p.id,
      name: p.name,
      role: p.role,
      group: p.group,
      alumni: p.alumni,
      bio: p.bio,
      interests: p.interests.length ? p.interests : undefined,
      email: p.email,
      orcid: p.orcid,
      scholar: p.scholar,
      github: p.github,
      website: p.website,
      linkedin: p.linkedin,
      yearJoined: p.yearJoined,
      yearLeft: p.yearLeft,
      currentPosition: p.currentPosition,
      order: p.order,
      hasPhoto: p.photo ? true : undefined,
    }));
  return new Response(JSON.stringify(list), {
    headers: { 'Content-Type': 'application/json' },
  });
};
