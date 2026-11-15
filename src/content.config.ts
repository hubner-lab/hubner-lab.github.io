import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    summary: z.string().optional(),
  }),
});

// Team card contract (see the member-card portal plan). `grad` exists only in the repo schema,
// for a hand-written entry whose level is not stated; the portal and the security rules never offer it.
export const TEAM_GROUPS = ['pi', 'postdoc', 'phd', 'grad', 'msc', 'staff', 'undergrad', 'visitor'] as const;

const team = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/team' }),
  schema: ({ image }) =>
    z.strictObject({
      name: z.string(),
      role: z.string(),
      group: z.enum(TEAM_GROUPS),
      alumni: z.boolean().default(false),
      bio: z.string().optional(),
      interests: z.array(z.string()).default([]),
      email: z.string().optional(),
      orcid: z.string().optional(),
      scholar: z.string().optional(),
      github: z.string().optional(),
      website: z.string().optional(),
      linkedin: z.string().optional(),
      yearJoined: z.number().int().optional(),
      yearLeft: z.number().int().optional(),
      currentPosition: z.string().optional(),
      photo: image().optional(),
      order: z.number().optional(),
      uid: z.string().optional(),
      rev: z.string().optional(),
    }),
});

export const collections = { news, team };
