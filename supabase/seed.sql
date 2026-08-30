-- Run this AFTER schema.sql, and edit the two email addresses first.
-- These are the only accounts that will ever get access.

insert into allowed_emails (email, display_name, initials, color) values
  ('greginose97@gmail.com', 'Greg',  'G', '#29359c'),
  ('herrgomnz@hotmail.com',  'Sofia', 'S', '#e9a0de')
on conflict (email) do update
  set display_name = excluded.display_name,
      initials     = excluded.initials,
      color        = excluded.color;

insert into categories (name, icon, sort_order) values
  ('Groceries',   'cart',      10),
  ('Utilities',   'bolt',      30),
  ('Dining',      'fork',      40),
  ('Transport',   'car',       50),
  ('Travel',      'plane',     60),
  ('Health',      'heart',     80),
  ('Household',   'home',       90),
  ('Fun',         'ticket',   100),
  ('Other',       'receipt',  200)
on conflict (name) do nothing;
