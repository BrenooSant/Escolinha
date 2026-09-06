-- =============================================================
--  Storage: fotos dos atletas
--  Bucket privado. O caminho é sempre <escolinha_id>/<aluno_id>.<ext>,
--  e a política confere a primeira pasta contra as escolinhas do
--  usuário. Como são fotos de menores, o front usa URL assinada.
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "membro vê fotos da escolinha" on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1]::uuid in (select public.escolinhas_do_usuario())
  );

create policy "membro envia foto" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1]::uuid in (select public.escolinhas_do_usuario())
  );

create policy "membro troca foto" on storage.objects for update to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1]::uuid in (select public.escolinhas_do_usuario())
  );

create policy "membro apaga foto" on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1]::uuid in (select public.escolinhas_do_usuario())
  );
