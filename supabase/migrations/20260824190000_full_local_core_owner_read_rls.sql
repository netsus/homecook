alter table public.users enable row level security;
alter table public.users no force row level security;
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select
  to authenticated
  using (id = auth.uid());
revoke select on public.users from anon;
revoke insert, update, delete on public.users from anon, authenticated;
grant select on public.users to authenticated;

alter table public.recipe_books enable row level security;
alter table public.recipe_books no force row level security;
drop policy if exists recipe_books_select_own on public.recipe_books;
create policy recipe_books_select_own on public.recipe_books
  for select
  to authenticated
  using (user_id = auth.uid());
revoke select on public.recipe_books from anon;
revoke insert, update, delete on public.recipe_books from anon, authenticated;
grant select on public.recipe_books to authenticated;

alter table public.recipe_book_items enable row level security;
alter table public.recipe_book_items no force row level security;
drop policy if exists recipe_book_items_select_owned_book on public.recipe_book_items;
create policy recipe_book_items_select_owned_book on public.recipe_book_items
  for select
  to authenticated
  using (exists (select 1 from public.recipe_books as recipe_book where recipe_book.id = recipe_book_items.book_id and recipe_book.user_id = auth.uid()));
revoke select on public.recipe_book_items from anon;
revoke insert, update, delete on public.recipe_book_items from anon, authenticated;
grant select on public.recipe_book_items to authenticated;

alter table public.meal_plan_columns enable row level security;
alter table public.meal_plan_columns no force row level security;
drop policy if exists meal_plan_columns_select_own on public.meal_plan_columns;
create policy meal_plan_columns_select_own on public.meal_plan_columns
  for select
  to authenticated
  using (user_id = auth.uid());
revoke select on public.meal_plan_columns from anon;
revoke insert, update, delete on public.meal_plan_columns from anon, authenticated;
grant select on public.meal_plan_columns to authenticated;

alter table public.meals enable row level security;
alter table public.meals no force row level security;
drop policy if exists meals_select_own on public.meals;
create policy meals_select_own on public.meals
  for select
  to authenticated
  using (user_id = auth.uid());
revoke select on public.meals from anon;
revoke insert, update, delete on public.meals from anon, authenticated;
grant select on public.meals to authenticated;

alter table public.cooking_sessions enable row level security;
alter table public.cooking_sessions no force row level security;
drop policy if exists cooking_sessions_select_own on public.cooking_sessions;
create policy cooking_sessions_select_own on public.cooking_sessions
  for select
  to authenticated
  using (user_id = auth.uid());
revoke select on public.cooking_sessions from anon;
revoke insert, update, delete on public.cooking_sessions from anon, authenticated;
grant select on public.cooking_sessions to authenticated;

alter table public.cooking_session_meals enable row level security;
alter table public.cooking_session_meals no force row level security;
drop policy if exists cooking_session_meals_select_owned_session on public.cooking_session_meals;
create policy cooking_session_meals_select_owned_session on public.cooking_session_meals
  for select
  to authenticated
  using (exists (select 1 from public.cooking_sessions as cooking_session where cooking_session.id = cooking_session_meals.session_id and cooking_session.user_id = auth.uid()));
revoke select on public.cooking_session_meals from anon;
revoke insert, update, delete on public.cooking_session_meals from anon, authenticated;
grant select on public.cooking_session_meals to authenticated;
