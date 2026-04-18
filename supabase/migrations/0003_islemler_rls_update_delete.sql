-- karar-analizi.html sayfasındaki "KAPAT" ve "SİL" işlemleri için
-- anon kullanıcıya select/update/delete yetkileri.

alter table public.islemler enable row level security;

grant usage on schema public to anon;
grant select, update, delete on table public.islemler to anon;

drop policy if exists "anon_select_islemler" on public.islemler;
create policy "anon_select_islemler"
on public.islemler
for select
to anon
using (true);

drop policy if exists "anon_update_islemler" on public.islemler;
create policy "anon_update_islemler"
on public.islemler
for update
to anon
using (true)
with check (true);

drop policy if exists "anon_delete_islemler" on public.islemler;
create policy "anon_delete_islemler"
on public.islemler
for delete
to anon
using (true);
