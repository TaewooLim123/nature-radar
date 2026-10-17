/* Nature Radar settings you can edit.

   COMMUNITY SHARING
   Leave both values empty and the Community tab runs in demo mode: the sample posts show,
   and posts you share stay on your own device.

   To let everyone who opens your app see each other's posts, create a free Supabase project
   (https://supabase.com), run supabase/setup.sql in its SQL Editor, then paste the project's
   URL and its anon / publishable key below. Both are safe to publish: the database only
   allows what setup.sql permits. Step-by-step instructions are in README.md. */
export const COMMUNITY = {
  supabaseUrl: '',      // e.g. 'https://abcdefghijklmnop.supabase.co'
  supabaseAnonKey: '',  // starts with 'eyJ…' (anon key) or 'sb_publishable_…'
};
