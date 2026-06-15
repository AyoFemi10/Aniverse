import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z
    .string({ required_error: 'Query parameter "q" is required' })
    .min(1, 'Search query must not be empty')
    .max(200, 'Search query too long')
    .trim(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResultItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string().url().or(z.string()),
  url: z.string().url(),
});

export const SearchResponseSchema = z.object({
  success: z.literal(true),
  results: z.array(SearchResultItemSchema),
  cached: z.boolean(),
  total: z.number().int().nonnegative(),
});
