-- Every grid that shows a post's photo — the feed, the trending strip, the
-- profile grid, search, The Cut, the solved section, the store grid — was
-- pulling the same ~1400px original used for the full detail view, just to
-- show it at 150-350px. That's what exhausted the project's free-tier
-- egress quota. New uploads now also produce a ~480px thumbnail
-- (js/image-utils.js), and every grid reads thumb_url first, falling back
-- to image_url for older rows that don't have one yet.

alter table public.requests add column if not exists thumb_url text;
alter table public.recommendations add column if not exists thumb_url text;
alter table public.products add column if not exists thumb_url text;
