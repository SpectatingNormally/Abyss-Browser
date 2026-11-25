ABYSS BROWSER — COMPLETE PACKAGE

This package includes the Abyss Browser app, its built-in permanent apps, the
separate custom YouTube app source, Supabase setup/repair SQL for both projects,
and read-only database audit queries.

SUPABASE PROJECTS
1. Your custom YouTube project: YOUTUBE-SETUP-NEW.sql
2. Your Abyss Browser project: ABYSS-SETUP-NEW.sql

These are separate projects. Follow SQL-INSTRUCTIONS.txt in order, back up each
project first, and run the matching audit query after each setup.

YouTube source: youtube-app-source/
YouTube audit: YOUTUBE-TABLE-AUDIT.sql
Abyss audit: ABYSS-TABLE-AUDIT.sql

The SQL scripts preserve legacy tables and existing user data. They do not
verify or change the live Supabase project until you run them in the dashboard.
Do not place service_role or sb_secret keys in this public repository.

GitHub Pages is static hosting. Abyss maintenance mode gates the app interface
but does not make public static assets inaccessible at the hosting layer.


Latest update: the built-in permanent YouTube app is bundled directly inside Abyss and uses the rebuilt app source. The old external YouTube shortcut is removed by the built-in-app migration. Global Blocker rules are read from the shared abyss_global_settings row for guests and signed-in users; account snapshots no longer supply blocker rules.
