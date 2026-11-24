-- Vérifier les paiements : ce que le site considère comme payé, et par où.
--
-- LECTURE SEULE : cette requête ne modifie rien.
-- À coller dans Supabase > SQL Editor (le bon projet), puis « Run ».
--
-- Une ligne par achat payé, du plus récent au plus ancien :
--   paye_par = « PawaPay »     : l'argent est arrivé sur le compte PawaPay
--                                (moins sa commission) ;
--   paye_par = « Autre moyen » : achat confirmé à la main dans l'administration,
--                                après un virement Mobile Money direct (ou avant
--                                PawaPay, avant le 31 octobre 2026). Cet argent-là
--                                n'est pas sur PawaPay.
--   depot_pawapay : l'identifiant à chercher dans la barre de recherche PawaPay.

with achats as (
  select 'Numéro employeur' as achat, id, price, payment_reference, payment_confirmed_at
    from public.contact_unlocks where payment_confirmed_at is not null
  union all
  select 'Numéro candidat', id, price, payment_reference, payment_confirmed_at
    from public.candidate_unlocks where payment_confirmed_at is not null
  union all
  select 'Publication offre', id, price, payment_reference, payment_confirmed_at
    from public.job_payments where payment_confirmed_at is not null
  union all
  select plan_name, id, price, payment_reference, payment_confirmed_at
    from public.subscriptions where payment_confirmed_at is not null
)
select to_char(a.payment_confirmed_at at time zone 'Africa/Brazzaville', 'DD/MM/YYYY HH24:MI') as paye_le,
       a.achat,
       a.price as montant,
       case when d.deposit_id is not null then 'PawaPay' else 'Autre moyen' end as paye_par,
       d.deposit_id as depot_pawapay,
       a.payment_reference as reference
  from achats a
  left join lateral (
    select p.deposit_id
      from public.pawapay_deposits p
     where p.target_id = a.id and p.status = 'COMPLETED'
     limit 1
  ) d on true
 order by a.payment_confirmed_at desc;
