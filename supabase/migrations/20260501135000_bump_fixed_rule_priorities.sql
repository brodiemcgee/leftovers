-- Generic transfer markers ('TRANSFER TO ', 'TRANSFER FROM ', etc.) and
-- specific fixed-category patterns ('HOME LOAN', 'AGL', 'YOUI') were both
-- seeded at priority 100. When a merchant matched both — e.g.
-- "Transfer to Home Loan" — the choice was a coin-flip, sometimes
-- classifying the user's mortgage payment as an internal transfer and
-- breaking the headroom forecast.
--
-- Bump the priority of every system rule in a fixed category so it
-- decisively beats the generic transfer rule. User-corrected rules sit at
-- 200 and still win above all of these.

update public.categorisation_rules cr
   set priority = 150
   from public.categories c
   where cr.category_id = c.id
     and cr.user_id is null
     and cr.priority = 100
     and c.slug in (
       'mortgage', 'rent', 'utilities', 'telco', 'insurance',
       'subscriptions_tech', 'financial_fees'
     );
