-- Anasayfa "Kaydet" işlemi için anon kullanıcıya insert izni
-- GitHub Pages gibi auth'suz istemcilerden kayıt atabilmek için gerekli.

alter table public.islemler enable row level security;

grant usage on schema public to anon;
grant insert on table public.islemler to anon;

drop policy if exists "anon_insert_islemler" on public.islemler;
create policy "anon_insert_islemler"
on public.islemler
for insert
to anon
with check (true);
