-- Leftovers — Seed data
-- System categories + ~500 AU merchant rules.
-- All rows have user_id = null and is_system = true.

-- =====================================================================
-- System categories
-- =====================================================================

insert into public.categories (id, user_id, slug, name, default_classification, icon, color, is_system) values
  (gen_random_uuid(), null, 'groceries',          'Groceries',           'discretionary', 'cart',          '#34C759', true),
  (gen_random_uuid(), null, 'food_drink',         'Food & drink',        'discretionary', 'fork.knife',    '#FF9500', true),
  (gen_random_uuid(), null, 'fuel',               'Fuel',                'discretionary', 'fuelpump',      '#FF3B30', true),
  (gen_random_uuid(), null, 'transport',          'Transport',           'discretionary', 'tram',          '#5AC8FA', true),
  (gen_random_uuid(), null, 'subscriptions_tech', 'Tech subscriptions',  'fixed',         'app',           '#5856D6', true),
  (gen_random_uuid(), null, 'telco',              'Telco',               'fixed',         'antenna.radiowaves.left.and.right', '#AF52DE', true),
  (gen_random_uuid(), null, 'utilities',          'Utilities',           'fixed',         'bolt',          '#FFCC00', true),
  (gen_random_uuid(), null, 'mortgage',           'Mortgage',            'fixed',         'house',         '#8E8E93', true),
  (gen_random_uuid(), null, 'rent',               'Rent',                'fixed',         'building.2',    '#8E8E93', true),
  (gen_random_uuid(), null, 'insurance',          'Insurance',           'fixed',         'shield',        '#007AFF', true),
  (gen_random_uuid(), null, 'medical',            'Medical',             'discretionary', 'cross.case',    '#FF2D55', true),
  (gen_random_uuid(), null, 'health_beauty',      'Health & beauty',     'discretionary', 'sparkles',      '#FF2D55', true),
  (gen_random_uuid(), null, 'fitness_recreation', 'Fitness & recreation','discretionary', 'figure.run',    '#34C759', true),
  (gen_random_uuid(), null, 'entertainment',      'Entertainment',       'discretionary', 'play.tv',       '#FF9500', true),
  (gen_random_uuid(), null, 'shopping',           'Shopping',            'discretionary', 'bag',           '#5AC8FA', true),
  (gen_random_uuid(), null, 'travel',             'Travel',              'discretionary', 'airplane',      '#007AFF', true),
  (gen_random_uuid(), null, 'education',          'Education',           'discretionary', 'book',          '#5856D6', true),
  (gen_random_uuid(), null, 'gifts_donations',    'Gifts & donations',   'discretionary', 'gift',          '#FF2D55', true),
  (gen_random_uuid(), null, 'alcohol',            'Alcohol',             'discretionary', 'wineglass',     '#AF52DE', true),
  (gen_random_uuid(), null, 'home_maintenance',   'Home maintenance',    'discretionary', 'hammer',        '#A2845E', true),
  (gen_random_uuid(), null, 'financial_fees',     'Financial fees',      'fixed',         'creditcard',    '#8E8E93', true),
  (gen_random_uuid(), null, 'cash_withdrawal',    'Cash withdrawal',     'discretionary', 'banknote',      '#34C759', true),
  (gen_random_uuid(), null, 'internal_transfer',  'Internal transfer',   'internal',      'arrow.left.arrow.right', '#8E8E93', true),
  (gen_random_uuid(), null, 'income_salary',      'Salary',              'income',        'briefcase',     '#34C759', true),
  (gen_random_uuid(), null, 'income_refund',      'Refund',              'refund',        'arrow.uturn.backward', '#34C759', true),
  (gen_random_uuid(), null, 'income_other',       'Other income',        'income',        'plus.circle',   '#34C759', true),
  (gen_random_uuid(), null, 'other',              'Other',               'discretionary', 'questionmark.circle', '#8E8E93', true)
on conflict do nothing;

-- =====================================================================
-- System merchant rules — ~500 AU patterns
-- All system rules use priority 100; user corrections will override at priority 200.
-- Patterns are case-insensitive substring matches.
-- =====================================================================

create or replace function public._seed_rule(p_pattern text, p_slug text, p_classification public.transaction_classification)
returns void
language plpgsql
as $$
declare
  v_cat_id uuid;
begin
  select id into v_cat_id from public.categories where user_id is null and slug = p_slug;
  insert into public.categorisation_rules (
    user_id, merchant_pattern, pattern_type, category_id, classification, source, priority, is_active
  ) values (
    null, p_pattern, 'substring', v_cat_id, p_classification, 'system', 100, true
  );
end;
$$;

-- Groceries (discretionary)
select public._seed_rule(p, 'groceries', 'discretionary') from unnest(array[
  'WOOLWORTHS','WOOLIES','COLES','ALDI','IGA','HARRIS FARM','FOODWORKS','SPUDSHED','RITCHIES',
  'COSTCO','DRAKES','FOODLAND','FRIENDLY GROCER','CAMPBELLS CASH','CHEAP AS CHIPS GROCER','SUPABARN'
]) as p;

-- Food & drink (discretionary)
select public._seed_rule(p, 'food_drink', 'discretionary') from unnest(array[
  'UBER EATS','UBEREATS','MENULOG','DELIVEROO','DOORDASH','MCDONALD','MCDONALDS','HUNGRY JACKS','KFC',
  'SUBWAY','GUZMAN Y GOMEZ','GYG','GRILL D','GRILLD','NANDOS','BOOST JUICE','SCHNITZ','CHATIME',
  'GLORIA JEANS','MUFFIN BREAK','BAKERS DELIGHT','BREADTOP','MICHEL''S PATISSERIE','DOMINOS','DOMINO''S',
  'PIZZA HUT','CRUST PIZZA','OPORTO','ROLL''D','SUSHI HUB','SUSHI SUSHI','BETTYS BURGERS','MAD MEX',
  'ZAMBRERO','SOUL ORIGIN','PRESS CAFE','PRESS COFFEE','CAFE','BAR ','RESTAURANT','BISTRO','TAKEAWAY','KITCHEN'
]) as p;

-- Fuel (discretionary)
select public._seed_rule(p, 'fuel', 'discretionary') from unnest(array[
  'BP ','BP A','BP P','BP C','AMPOL','SHELL','7-ELEVEN','7 ELEVEN','SEVEN ELEVEN','UNITED PETROLEUM',
  'COLES EXPRESS','METRO FUEL','PUMA ENERGY','LIBERTY','APCO','MOBIL','CALTEX'
]) as p;

-- Transport (discretionary)
select public._seed_rule(p, 'transport', 'discretionary') from unnest(array[
  'UBER ','UBER*','UBER TRIP','OLA ','DIDI','TRANSPORTNSW','MYKI','OPAL','GOCARD','GO CARD','METRO TASMANIA',
  'TRANSPERTH','METROCARD ADELAIDE','TRANSLINK','PARKING','WILSON PARKING','SECURE PARKING','CARE PARK',
  'EZIPARK','PARKMAN','PARKINGAUSTRALIA','LINKT','EASTLINK','CITYLINK','E-TOLL','ETOLL','TRANSURBAN',
  'TAXI','13CABS','SILVER SERVICE','PREMIER CABS','GOCATCH','SHEBAH','UBER POOL','GREYHOUND','VIRGIN AUSTRALIA',
  'QANTAS','JETSTAR','REX AIRLINES','TIGERAIR','SKYBUS','VLINE','NSW TRAINLINK','QR ','QUEENSLAND RAIL'
]) as p;

-- Tech subscriptions (fixed)
select public._seed_rule(p, 'subscriptions_tech', 'fixed') from unnest(array[
  'NETFLIX','SPOTIFY','APPLE.COM/BILL','APPLE COM BILL','APPLE ITUNES','ITUNES','APPLE MUSIC','APPLE TV',
  'ICLOUD','APPLE ONE','GOOGLE *YOUTUBE','YOUTUBE PREMIUM','GOOGLE *GOOGLE','GOOGLE STORAGE','GOOGLE ONE',
  'DROPBOX','MICROSOFT','MICROSOFT*OFFICE','OFFICE 365','MICROSOFT 365','XBOX','PLAYSTATION','PSN',
  'NINTENDO','STEAM','EPIC GAMES','BLIZZARD','EA *','TWITCH','DISNEY+','DISNEY PLUS','BINGE','STAN',
  'KAYO','PARAMOUNT+','PARAMOUNT PLUS','HAYU','BRITBOX','SHUDDER','CRUNCHYROLL','PRIME VIDEO','AMAZON PRIME',
  'AUDIBLE','KINDLE','NEW YORK TIMES','NYT','THE AUSTRALIAN','SMH','THE AGE','AFR','THE GUARDIAN',
  'NOTION','LINEAR','VERCEL','GITHUB','RESEND','OPENAI','ANTHROPIC','CLAUDE','MIDJOURNEY','MESHY',
  'PUT.IO','PUTIO','RAYCAST','OBSIDIAN','1PASSWORD','LASTPASS','BITWARDEN','EXPRESSVPN','NORDVPN',
  'TIDAL','DEEZER','SOUNDCLOUD','FIGMA','ADOBE','CANVA','SLACK','ZOOM','LOOM','CALENDLY','DESCRIPT'
]) as p;

-- Telco (fixed)
select public._seed_rule(p, 'telco', 'fixed') from unnest(array[
  'OPTUS','TELSTRA','VODAFONE','TPG','BELONG','AMAYSIM','BOOST MOBILE','KOGAN MOBILE','ALDIMOBILE','ALDI MOBILE',
  'CIRCLES.LIFE','SUPERLOOP','TANGERINE','EXETEL','MORE TELECOM','DODO','iiNET','SKYMESH','AUSSIE BROADBAND',
  'INTERNODE','MATE COMMUNICATE','SPINTEL'
]) as p;

-- Utilities (fixed)
select public._seed_rule(p, 'utilities', 'fixed') from unnest(array[
  'AGL','ORIGIN ENERGY','ENERGY AUSTRALIA','ENERGYAUSTRALIA','SIMPLY ENERGY','RED ENERGY','ALINTA ENERGY','ALINTA',
  'POWERSHOP','MOMENTUM ENERGY','LUMO ENERGY','POWERDIRECT','GLOBIRD ENERGY','OVO ENERGY','TANGO ENERGY',
  'CITYWEST WATER','SOUTH EAST WATER','YARRA VALLEY WATER','SYDNEY WATER','SA WATER','ICON WATER','UNITY WATER',
  'URBAN UTILITIES','HUNTER WATER','POWER AND WATER','WESTERN WATER','GIPPSLAND WATER','TASMANIAN WATER'
]) as p;

-- Mortgage (fixed) — kept generic; PRD §F3 says mortgage MUST be confirmed by user, never auto-LLM'd
select public._seed_rule(p, 'mortgage', 'fixed') from unnest(array[
  'HOME LOAN','MORTGAGE PAYMENT','HOMELOAN','MORTGAGE','LOAN REPAYMENT','LOAN PMT'
]) as p;

-- Insurance (fixed)
select public._seed_rule(p, 'insurance', 'fixed') from unnest(array[
  'AHM','MEDIBANK','BUPA','HCF','NIB','HBF','GMHBA','LATROBE HEALTH','TEACHERS HEALTH','POLICE HEALTH','DEFENCE HEALTH',
  'AAMI','NRMA','RACV','RACQ','RAA','RACWA','SUNCORP','ALLIANZ','BUDGET DIRECT','BINGLE','YOUI','APIA','COLES INSURANCE',
  'WOOLWORTHS INSURANCE','REAL INSURANCE','AUSTRALIAN PET INSURANCE','PET INSURANCE','PETPLAN','BOW WOW MEOW','PETSURE',
  'TIO INSURANCE','CGU','ZURICH','TAL','MLC INSURANCE','CLEARVIEW','RESI INSURANCE','ELDERS INSURANCE','HONEY INSURANCE'
]) as p;

-- Medical (discretionary)
select public._seed_rule(p, 'medical', 'discretionary') from unnest(array[
  'MEDICARE','CHEMIST WAREHOUSE','PRICELINE PHARMACY','TERRY WHITE','GUARDIAN PHARMACY','AMCAL','MY CHEMIST',
  'WIZARD PHARMACY','GP ','MEDICAL CENTRE','DENTAL','DENTIST','PATHOLOGY','RADIOLOGY','LAB','PHYSIO','PHYSIOTHERAPY',
  'OPTOMETRIST','OPTICAL','SPECSAVERS','OPSM','PSYCHOLOGY','PSYCHOLOGIST','DOCTOR','HOSPITAL','EPWORTH','MERCY HOSPITAL',
  'CABRINI','ST VINCENT''S HEALTH','RAMSAY HEALTH','HEALTHSCOPE','CHEMIST DIRECT'
]) as p;

-- Health & beauty (discretionary)
select public._seed_rule(p, 'health_beauty', 'discretionary') from unnest(array[
  'MECCA','SEPHORA','PRICELINE','ULTRACEUTICALS','SUPRE','LUSH','BODY SHOP','LOREAL','ESTEE LAUDER','CLINIQUE',
  'HAIRDRESSER','BARBER','NAIL ','BEAUTY','SPA','MASSAGE','MICROBLADING','LASER CLINICS','SILK LASER'
]) as p;

-- Fitness & recreation (discretionary)
select public._seed_rule(p, 'fitness_recreation', 'discretionary') from unnest(array[
  'GYM','ANYTIME FITNESS','F45','SNAP FITNESS','GOODLIFE','JETTS','CROSSFIT','FIT N FAST','FERNWOOD','PLUS FITNESS',
  'BARRE','PILATES','YOGA','CLUB LIME','VIVA LEISURE','BELGRAVIA LEISURE','VICTORIAN GYM','VIC SPORT','HOCKEY',
  'BOWLING','TENNIS','GOLF','CRICKET','AFL','NRL'
]) as p;

-- Entertainment (discretionary)
select public._seed_rule(p, 'entertainment', 'discretionary') from unnest(array[
  'EVENT CINEMAS','HOYTS','VILLAGE CINEMAS','PALACE CINEMAS','READING CINEMAS','DENDY','LUNA','CINEPLEX',
  'TICKETEK','TICKETMASTER','OZTIX','MOSHTIX','EVENTBRITE','LIVE NATION','FRONTIER TOURING','TEG DAINTY',
  'LASER TAG','TIMEZONE','HOLEY MOLEY','STRIKE BOWLING','ARCADE'
]) as p;

-- Shopping (discretionary)
select public._seed_rule(p, 'shopping', 'discretionary') from unnest(array[
  'KMART','BIG W','TARGET AUSTRALIA','TARGET COUNTRY','MYER','DAVID JONES','HARRIS SCARFE','SPOTLIGHT','LINCRAFT',
  'IKEA','FANTASTIC FURNITURE','HARVEY NORMAN','THE GOOD GUYS','JB HI-FI','JB HIFI','OFFICEWORKS','APPLE STORE',
  'AMAZON AU','AMAZON.COM.AU','AMAZON','EBAY','CATCH.COM.AU','CATCH','TEMU','KOGAN','THE ICONIC','SHEIN',
  'COTTON ON','UNIQLO','H&M','ZARA','UNIVERSAL STORE','LORNA JANE','LULULEMON','RIVERS','REBEL SPORT','BCF',
  'ANACONDA','SUPER CHEAP AUTO','SUPERCHEAP AUTO','BUNNINGS','MITRE 10','TOTAL TOOLS','REPCO','AUTOBARN'
]) as p;

-- Travel (discretionary)
select public._seed_rule(p, 'travel', 'discretionary') from unnest(array[
  'AIRBNB','BOOKING.COM','BOOKING COM','EXPEDIA','HOTELS.COM','TRIVAGO','AGODA','WEBJET','FLIGHT CENTRE',
  'WOTIF','LASTMINUTE','TRIPADEAL','LUXURY ESCAPES','SCOOT','EMIRATES','SINGAPORE AIRLINES','AIR NEW ZEALAND',
  'CATHAY PACIFIC','AIR ASIA','MALAYSIA AIRLINES','THAI AIRWAYS','HERTZ','AVIS','BUDGET CAR','EUROPCAR','SIXT',
  'THRIFTY','REDSPOT','EAST COAST CAR','APEX CAR'
]) as p;

-- Education (discretionary)
select public._seed_rule(p, 'education', 'discretionary') from unnest(array[
  'UNIVERSITY','TAFE','TAFENSW','TAFE SA','TAFE QLD','RMIT','MONASH','UNSW','UNIMELB','UTS','SYDNEY UNI',
  'UDEMY','COURSERA','EDX','SKILLSHARE','MASTERCLASS','LINKEDIN LEARNING','PLURALSIGHT','EGGHEAD','FRONTEND MASTERS'
]) as p;

-- Gifts & donations (discretionary)
select public._seed_rule(p, 'gifts_donations', 'discretionary') from unnest(array[
  'OXFAM','RED CROSS','SALVATION ARMY','SALVOS','VINNIES','WORLD VISION','UNICEF','GIVING','GOFUNDME',
  'GIFTPAY','PROZE','PROZIS','HALLMARK','SMIGGLE','PAPER TREE'
]) as p;

-- Alcohol (discretionary)
select public._seed_rule(p, 'alcohol', 'discretionary') from unnest(array[
  'DAN MURPHY','BWS','LIQUORLAND','FIRST CHOICE LIQUOR','VINTAGE CELLARS','CELLARBRATIONS','BOTTLEMART',
  'IGA LIQUOR','NICKS WINE','GET WINES DIRECT','BRAND CONNECT','BREWGRADE','PINTHOUSE'
]) as p;

-- Home maintenance (discretionary)
select public._seed_rule(p, 'home_maintenance', 'discretionary') from unnest(array[
  'BUNNINGS','MITRE 10','MITRE10','HOME HARDWARE','TOTAL TOOLS','SYDNEY TOOLS','ELECTRICIAN','PLUMBER','LOCKSMITH',
  'GARDENER','LAWN MOWING','PEST CONTROL','CLEANING'
]) as p;

-- Financial fees (fixed)
select public._seed_rule(p, 'financial_fees', 'fixed') from unnest(array[
  'BANK FEE','MONTHLY FEE','ACCOUNT FEE','OVERDRAFT FEE','LATE FEE','INT CHARGE','INTEREST CHARGE','FX FEE',
  'INTERNATIONAL TRANSACTION FEE','SERVICE FEE','ANNUAL FEE','CARD FEE','ATM FEE','FOREIGN TRANSACTION'
]) as p;

-- Cash withdrawals (discretionary)
select public._seed_rule(p, 'cash_withdrawal', 'discretionary') from unnest(array[
  'ATM ','ATM WITHDRAWAL','CASH OUT','CARDLESS CASH','REDIATM'
]) as p;

-- Internal transfer markers (these may be overridden by the matcher)
select public._seed_rule(p, 'internal_transfer', 'internal') from unnest(array[
  'TRANSFER TO ','TRANSFER FROM ','OSKO PAYMENT','PAYID','BPAY ','ROUND UP','SAVERS','FORWARD','OFFSET'
]) as p;

-- Income markers
select public._seed_rule(p, 'income_salary', 'income') from unnest(array[
  'SALARY','PAY ','PAYROLL','WAGE','WAGES','EMPLOYER','GOVERNMENT BEN','CENTRELINK','CRA REFUND','TAX REFUND ATO'
]) as p;

drop function public._seed_rule(text, text, public.transaction_classification);
