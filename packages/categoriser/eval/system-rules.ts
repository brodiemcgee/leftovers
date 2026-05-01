/**
 * Mirror of the system rules seeded into Postgres (supabase/seed.sql).
 * Keep these two files in sync — the eval harness uses this list because CI
 * doesn't have a live database. A future improvement: parse seed.sql at eval
 * time. For now the duplication is intentional and small.
 */

import type { SystemRule } from '../src/types.js';
import type { ClassificationEnum } from '@leftovers/shared/database';
import type { SystemCategorySlug } from '@leftovers/shared';

function rules(
  patterns: string[],
  categorySlug: SystemCategorySlug,
  classification: ClassificationEnum,
): SystemRule[] {
  return patterns.map((pattern) => ({
    pattern,
    patternType: 'substring' as const,
    categorySlug,
    classification,
    priority: 100,
  }));
}

export const SYSTEM_RULES: SystemRule[] = [
  ...rules(
    ['WOOLWORTHS', 'WOOLIES', 'COLES', 'ALDI', 'IGA', 'HARRIS FARM', 'FOODWORKS', 'COSTCO', 'DRAKES', 'FOODLAND', 'SUPABARN'],
    'groceries',
    'discretionary',
  ),
  ...rules(
    [
      'UBER EATS', 'UBEREATS', 'MENULOG', 'DELIVEROO', 'DOORDASH', 'MCDONALD', 'MCDONALDS', 'HUNGRY JACKS',
      'KFC', 'SUBWAY', 'GUZMAN Y GOMEZ', 'GYG', "GRILL'D", 'GRILLD', 'NANDOS', 'BOOST JUICE', 'CHATIME',
      'GLORIA JEANS', 'MUFFIN BREAK', 'BAKERS DELIGHT', 'DOMINOS', "DOMINO'S", 'PIZZA HUT', 'CRUST PIZZA',
      'OPORTO', "ROLL'D", 'SUSHI HUB', 'SUSHI SUSHI', 'BETTYS BURGERS', 'MAD MEX', 'ZAMBRERO', 'SOUL ORIGIN',
      'CAFE', 'BAR ', 'RESTAURANT', 'BISTRO', 'TAKEAWAY',
    ],
    'food_drink',
    'discretionary',
  ),
  ...rules(
    ['BP ', 'BP A', 'BP P', 'BP C', 'AMPOL', 'SHELL', '7-ELEVEN', '7 ELEVEN', 'SEVEN ELEVEN', 'UNITED PETROLEUM', 'COLES EXPRESS', 'METRO FUEL', 'PUMA ENERGY', 'LIBERTY', 'APCO', 'MOBIL', 'CALTEX'],
    'fuel',
    'discretionary',
  ),
  ...rules(
    [
      'UBER ', 'UBER*', 'UBER TRIP', 'OLA ', 'DIDI', 'TRANSPORTNSW', 'MYKI', 'OPAL', 'GOCARD', 'TRANSLINK',
      'PARKING', 'WILSON PARKING', 'SECURE PARKING', 'CARE PARK', 'EZIPARK', 'LINKT', 'EASTLINK', 'CITYLINK',
      'E-TOLL', 'ETOLL', 'TRANSURBAN', 'TAXI', '13CABS', 'GOCATCH', 'SHEBAH', 'GREYHOUND', 'VIRGIN AUSTRALIA',
      'QANTAS', 'JETSTAR', 'REX AIRLINES', 'TIGERAIR', 'SKYBUS', 'VLINE',
    ],
    'transport',
    'discretionary',
  ),
  ...rules(
    [
      'NETFLIX', 'SPOTIFY', 'APPLE.COM/BILL', 'APPLE COM BILL', 'APPLE ITUNES', 'ITUNES', 'APPLE MUSIC',
      'APPLE TV', 'ICLOUD', 'APPLE ONE', 'GOOGLE *YOUTUBE', 'YOUTUBE PREMIUM', 'GOOGLE *GOOGLE',
      'GOOGLE STORAGE', 'GOOGLE ONE', 'DROPBOX', 'MICROSOFT', 'MICROSOFT*OFFICE', 'OFFICE 365',
      'MICROSOFT 365', 'XBOX', 'PLAYSTATION', 'PSN', 'NINTENDO', 'STEAM', 'EPIC GAMES', 'BLIZZARD', 'EA *',
      'TWITCH', 'DISNEY+', 'DISNEY PLUS', 'BINGE', 'STAN', 'KAYO', 'PARAMOUNT+', 'PARAMOUNT PLUS',
      'CRUNCHYROLL', 'PRIME VIDEO', 'AMAZON PRIME', 'AUDIBLE', 'KINDLE', 'NEW YORK TIMES', 'NYT',
      'NOTION', 'LINEAR', 'VERCEL', 'GITHUB', 'RESEND', 'OPENAI', 'ANTHROPIC', 'CLAUDE', 'MIDJOURNEY',
      'PUT.IO', 'PUTIO', 'RAYCAST', 'OBSIDIAN', '1PASSWORD', 'BITWARDEN', 'EXPRESSVPN', 'NORDVPN',
      'TIDAL', 'DEEZER', 'FIGMA', 'ADOBE', 'CANVA', 'SLACK', 'ZOOM', 'LOOM',
    ],
    'subscriptions_tech',
    'fixed',
  ),
  ...rules(
    [
      'OPTUS', 'TELSTRA', 'VODAFONE', 'TPG', 'BELONG', 'AMAYSIM', 'BOOST MOBILE', 'KOGAN MOBILE',
      'ALDIMOBILE', 'ALDI MOBILE', 'CIRCLES.LIFE', 'SUPERLOOP', 'TANGERINE', 'EXETEL', 'MORE TELECOM',
      'DODO', 'IINET', 'AUSSIE BROADBAND', 'INTERNODE', 'SPINTEL',
    ],
    'telco',
    'fixed',
  ),
  ...rules(
    [
      'AGL', 'ORIGIN ENERGY', 'ENERGY AUSTRALIA', 'ENERGYAUSTRALIA', 'SIMPLY ENERGY', 'RED ENERGY',
      'ALINTA ENERGY', 'ALINTA', 'POWERSHOP', 'MOMENTUM ENERGY', 'LUMO ENERGY', 'POWERDIRECT',
      'GLOBIRD ENERGY', 'OVO ENERGY', 'TANGO ENERGY', 'CITYWEST WATER', 'SOUTH EAST WATER',
      'YARRA VALLEY WATER', 'SYDNEY WATER', 'SA WATER', 'ICON WATER', 'UNITY WATER',
    ],
    'utilities',
    'fixed',
  ),
  ...rules(
    ['HOME LOAN', 'MORTGAGE PAYMENT', 'HOMELOAN', 'MORTGAGE', 'LOAN REPAYMENT', 'LOAN PMT'],
    'mortgage',
    'fixed',
  ),
  ...rules(
    [
      'AHM', 'MEDIBANK', 'BUPA', 'HCF', 'NIB', 'HBF', 'GMHBA', 'AAMI', 'NRMA', 'RACV', 'RACQ', 'RAA',
      'RACWA', 'SUNCORP INSURANCE', 'ALLIANZ', 'BUDGET DIRECT', 'BINGLE', 'YOUI', 'APIA', 'COLES INSURANCE',
      'WOOLWORTHS INSURANCE', 'REAL INSURANCE', 'PETSURE', 'BOW WOW MEOW', 'PETPLAN', 'PET INSURANCE',
      'TIO INSURANCE', 'CGU', 'ZURICH', 'TAL ', 'MLC INSURANCE', 'RACV INSURANCE', 'NRMA INSURANCE',
      'HONEY INSURANCE',
    ],
    'insurance',
    'fixed',
  ),
  ...rules(
    [
      'MEDICARE', 'CHEMIST WAREHOUSE', 'PRICELINE PHARMACY', 'TERRY WHITE', 'GUARDIAN PHARMACY', 'AMCAL',
      'MY CHEMIST', 'GP ', 'MEDICAL CENTRE', 'DENTAL', 'DENTIST', 'PATHOLOGY', 'RADIOLOGY', 'PHYSIO',
      'PHYSIOTHERAPY', 'OPTOMETRIST', 'OPTICAL', 'SPECSAVERS', 'OPSM', 'PSYCHOLOGY', 'DOCTOR', 'HOSPITAL',
    ],
    'medical',
    'discretionary',
  ),
  ...rules(
    ['MECCA', 'SEPHORA', 'PRICELINE', 'LUSH', 'BODY SHOP', 'HAIRDRESSER', 'BARBER', 'BEAUTY', 'SPA ', 'MASSAGE', 'LASER CLINICS'],
    'health_beauty',
    'discretionary',
  ),
  ...rules(
    ['GYM', 'ANYTIME FITNESS', 'F45', 'SNAP FITNESS', 'GOODLIFE', 'JETTS', 'CROSSFIT', 'FERNWOOD', 'PLUS FITNESS', 'PILATES', 'YOGA'],
    'fitness_recreation',
    'discretionary',
  ),
  ...rules(
    [
      'EVENT CINEMAS', 'HOYTS', 'VILLAGE CINEMAS', 'PALACE CINEMAS', 'READING CINEMAS', 'DENDY',
      'TICKETEK', 'TICKETMASTER', 'OZTIX', 'MOSHTIX', 'EVENTBRITE', 'LIVE NATION', 'FRONTIER TOURING',
    ],
    'entertainment',
    'discretionary',
  ),
  ...rules(
    [
      'KMART', 'BIG W', 'TARGET AUSTRALIA', 'TARGET COUNTRY', 'MYER', 'DAVID JONES', 'HARRIS SCARFE',
      'SPOTLIGHT', 'IKEA', 'FANTASTIC FURNITURE', 'HARVEY NORMAN', 'THE GOOD GUYS', 'JB HI-FI', 'JB HIFI',
      'OFFICEWORKS', 'APPLE STORE', 'AMAZON AU', 'AMAZON.COM.AU', 'AMAZON', 'EBAY', 'CATCH.COM.AU', 'CATCH',
      'TEMU', 'KOGAN', 'THE ICONIC', 'SHEIN', 'COTTON ON', 'UNIQLO', 'H&M', 'ZARA', 'UNIVERSAL STORE',
      'LORNA JANE', 'LULULEMON', 'RIVERS', 'REBEL SPORT', 'BCF', 'ANACONDA', 'SUPER CHEAP AUTO',
      'SUPERCHEAP AUTO',
    ],
    'shopping',
    'discretionary',
  ),
  ...rules(
    [
      'AIRBNB', 'BOOKING.COM', 'BOOKING COM', 'EXPEDIA', 'HOTELS.COM', 'TRIVAGO', 'AGODA', 'WEBJET',
      'FLIGHT CENTRE', 'WOTIF', 'LASTMINUTE', 'TRIPADEAL', 'LUXURY ESCAPES', 'EMIRATES',
      'SINGAPORE AIRLINES', 'AIR NEW ZEALAND', 'CATHAY PACIFIC', 'AIR ASIA', 'MALAYSIA AIRLINES',
      'THAI AIRWAYS', 'HERTZ', 'AVIS', 'BUDGET CAR', 'EUROPCAR', 'SIXT', 'THRIFTY',
    ],
    'travel',
    'discretionary',
  ),
  ...rules(
    ['UNIVERSITY', 'TAFE', 'RMIT', 'MONASH', 'UNSW', 'UNIMELB', 'UTS', 'SYDNEY UNI', 'UDEMY', 'COURSERA', 'EDX', 'SKILLSHARE', 'MASTERCLASS', 'LINKEDIN LEARNING', 'PLURALSIGHT'],
    'education',
    'discretionary',
  ),
  ...rules(
    ['OXFAM', 'RED CROSS', 'SALVATION ARMY', 'SALVOS', 'VINNIES', 'WORLD VISION', 'UNICEF', 'GOFUNDME', 'SMIGGLE', 'PAPER TREE'],
    'gifts_donations',
    'discretionary',
  ),
  ...rules(
    ['DAN MURPHY', 'BWS', 'LIQUORLAND', 'FIRST CHOICE LIQUOR', 'VINTAGE CELLARS', 'CELLARBRATIONS', 'BOTTLEMART', 'IGA LIQUOR'],
    'alcohol',
    'discretionary',
  ),
  ...rules(
    ['BUNNINGS', 'MITRE 10', 'MITRE10', 'HOME HARDWARE', 'TOTAL TOOLS', 'SYDNEY TOOLS', 'ELECTRICIAN', 'PLUMBER', 'LOCKSMITH', 'GARDENER', 'PEST CONTROL', 'CLEANING'],
    'home_maintenance',
    'discretionary',
  ),
  ...rules(
    ['BANK FEE', 'MONTHLY FEE', 'ACCOUNT FEE', 'OVERDRAFT FEE', 'LATE FEE', 'INT CHARGE', 'INTEREST CHARGE', 'FX FEE', 'INTERNATIONAL TRANSACTION FEE', 'SERVICE FEE', 'ANNUAL FEE', 'CARD FEE', 'ATM FEE', 'FOREIGN TRANSACTION'],
    'financial_fees',
    'fixed',
  ),
  ...rules(
    ['ATM ', 'ATM WITHDRAWAL', 'CASH OUT', 'CARDLESS CASH', 'REDIATM'],
    'cash_withdrawal',
    'discretionary',
  ),
  ...rules(
    ['TRANSFER TO ', 'TRANSFER FROM ', 'OSKO PAYMENT', 'PAYID', 'BPAY ', 'ROUND UP', 'SAVERS', 'FORWARD', 'OFFSET'],
    'internal_transfer',
    'internal',
  ),
  ...rules(
    ['SALARY', 'PAY ', 'PAYROLL', 'WAGE', 'WAGES', 'GOVERNMENT BEN', 'CENTRELINK', 'TAX REFUND ATO'],
    'income_salary',
    'income',
  ),
  ...rules(
    ['REFUND'],
    'income_refund',
    'refund',
  ),
];
