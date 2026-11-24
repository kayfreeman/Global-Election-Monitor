// Country, election and hierarchy definitions for the five jurisdictions.
// Top-level geography uses real names. Deeper levels (counties, LGAs outside
// Lagos, wards, polling units, divisions, electorates) are SYNTHETIC demo units
// until real boundary/roster data is loaded (see README "Replacing synthetic geography").

export const COUNTRIES = {
  USA: {
    code: 'USA', iso2: 'US', name: 'United States', authority: 'FEC / States', authorityShort: 'FEC',
    tz: 'America/New_York', clock: 'WDC', accent: '#2563eb',
    election: {
      name: '2026 Midterms (House / Senate / Governor)', date: '2026-11-03', phase: 'post-election canvass',
      note: 'Held 3 Nov 2026. Louisiana CD-5/CD-6 runoffs 12 Dec 2026. Live results require an AP Elections API licence.',
    },
    levels: ['Country', 'State', 'County', 'Precinct'],
    unitWord: 'precincts', metricWord: 'Reporting',
    parties: [
      { code: 'DEM', name: 'Democratic', color: '#2563eb', w: 0.49 },
      { code: 'GOP', name: 'Republican', color: '#dc2626', w: 0.48 },
      { code: 'OTH', name: 'Other', color: '#94a3b8', w: 0.03 },
    ],
  },
  AUS: {
    code: 'AUS', iso2: 'AU', name: 'Australia', authority: 'AEC / VEC', authorityShort: 'AEC',
    tz: 'Australia/Melbourne', clock: 'MEL', accent: '#0f766e',
    election: {
      name: 'Victorian State Election', date: '2026-11-28', phase: 'early voting',
      note: 'State election run by the VEC, not the federal AEC media feed. Early voting opened 18 Nov 2026.',
    },
    levels: ['Country', 'State / Territory', 'Division', 'Voting Centre'],
    unitWord: 'voting centres', metricWord: 'Counted',
    parties: [
      { code: 'ALP', name: 'Labor', color: '#dc2626', w: 0.33 },
      { code: 'LNP', name: 'Liberal–National Coalition', color: '#2563eb', w: 0.33 },
      { code: 'GRN', name: 'Greens', color: '#16a34a', w: 0.12 },
      { code: 'ONP', name: 'One Nation', color: '#f97316', w: 0.10 },
      { code: 'IND', name: 'Independents / Other', color: '#64748b', w: 0.12 },
    ],
  },
  NGA: {
    code: 'NGA', iso2: 'NG', name: 'Nigeria', authority: 'INEC', authorityShort: 'INEC',
    tz: 'Africa/Lagos', clock: 'ABJ', accent: '#15803d',
    election: {
      name: 'Presidential & National Assembly', date: '2027-01-16', phase: 'campaign',
      note: 'Revised INEC timetable (Feb 2026, Electoral Act 2026); governorship 6 Feb 2027. Confirm on inecnigeria.org. IReV publishes PU result sheets; it has no documented public API.',
    },
    levels: ['Country', 'Geopolitical Zone', 'State', 'LGA', 'Ward', 'Polling Unit'],
    unitWord: 'polling units', metricWord: 'Collated',
    parties: [
      { code: 'APC', name: 'All Progressives Congress', color: '#1d4ed8', w: 0.37 },
      { code: 'PDP', name: "Peoples Democratic Party", color: '#dc2626', w: 0.27 },
      { code: 'LP', name: 'Labour Party', color: '#16a34a', w: 0.24 },
      { code: 'NNPP', name: 'New Nigeria Peoples Party', color: '#9333ea', w: 0.07 },
      { code: 'OTH', name: 'Others', color: '#94a3b8', w: 0.05 },
    ],
  },
  GBR: {
    code: 'GBR', iso2: 'GB', name: 'United Kingdom', authority: 'Electoral Commission', authorityShort: 'EC',
    tz: 'Europe/London', clock: 'LON', accent: '#7c3aed',
    election: {
      name: 'Simulation exercise (no national poll scheduled)', date: null, phase: 'between elections',
      note: 'Local/devolved elections were held 7 May 2026; council by-elections continue. Candidate and FPTP results data: Democracy Club (CC-BY).',
    },
    levels: ['Country', 'Nation', 'Region', 'Constituency', 'Ward'],
    unitWord: 'wards', metricWord: 'Declared',
    parties: [
      { code: 'LAB', name: 'Labour', color: '#dc2626', w: 0.24 },
      { code: 'REF', name: 'Reform UK', color: '#0891b2', w: 0.27 },
      { code: 'CON', name: 'Conservative', color: '#2563eb', w: 0.18 },
      { code: 'LD', name: 'Liberal Democrats', color: '#f97316', w: 0.13 },
      { code: 'GRN', name: 'Green', color: '#16a34a', w: 0.11 },
      { code: 'SNP', name: 'SNP', color: '#facc15', w: 0.07 },
    ],
  },
  CAN: {
    code: 'CAN', iso2: 'CA', name: 'Canada', authority: 'Elections Canada', authorityShort: 'EC',
    tz: 'America/Toronto', clock: 'OTT', accent: '#b91c1c',
    election: {
      name: 'Between federal elections', date: null, phase: 'between elections',
      note: 'Last general election: 28 Apr 2025 (45th). Next fixed date is in Oct 2029 unless Parliament is dissolved earlier. By-elections are published by Elections Canada as they happen.',
    },
    levels: ['Country', 'Province / Territory', 'Electoral District', 'Polling Station'],
    unitWord: 'polling stations', metricWord: 'Reporting',
    parties: [
      { code: 'LPC', name: 'Liberal', color: '#dc2626', w: 0.42 },
      { code: 'CPC', name: 'Conservative', color: '#1d4ed8', w: 0.40 },
      { code: 'BQ', name: 'Bloc Québécois', color: '#0ea5e9', w: 0.06 },
      { code: 'NDP', name: 'NDP', color: '#f97316', w: 0.07 },
      { code: 'GPC', name: 'Green', color: '#16a34a', w: 0.02 },
      { code: 'PPC', name: "People's Party", color: '#6d28d9', w: 0.01 },
      { code: 'IND', name: 'Independent', color: '#64748b', w: 0.01 },
      { code: 'OTH', name: 'Other', color: '#94a3b8', w: 0.01 },
    ],
  },
};

// Alphabetical by country name: Australia, Canada, Nigeria, United Kingdom, United States.
export const COUNTRY_ORDER = ['AUS', 'CAN', 'NGA', 'GBR', 'USA'];
export const byCountryName = (a, b) => (COUNTRY_ORDER.indexOf(a) + 1 || 99) - (COUNTRY_ORDER.indexOf(b) + 1 || 99); // '*' (all countries) sorts last

// ---------- Real top-level geography ----------
export const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],
  ['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],
  ['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
  ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
  ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
  ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
  ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],
  ['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

export const NG_ZONES = [
  ['NC', 'North Central', [['BE','Benue'],['KO','Kogi'],['KW','Kwara'],['NA','Nasarawa'],['NI','Niger'],['PL','Plateau'],['FC','FCT Abuja']]],
  ['NE', 'North East', [['AD','Adamawa'],['BA','Bauchi'],['BO','Borno'],['GO','Gombe'],['TA','Taraba'],['YO','Yobe']]],
  ['NW', 'North West', [['JI','Jigawa'],['KD','Kaduna'],['KN','Kano'],['KT','Katsina'],['KE','Kebbi'],['SO','Sokoto'],['ZA','Zamfara']]],
  ['SE', 'South East', [['AB','Abia'],['AN','Anambra'],['EB','Ebonyi'],['EN','Enugu'],['IM','Imo']]],
  ['SS', 'South South', [['AK','Akwa Ibom'],['BY','Bayelsa'],['CR','Cross River'],['DE','Delta'],['ED','Edo'],['RI','Rivers']]],
  ['SW', 'South West', [['EK','Ekiti'],['LA','Lagos'],['OG','Ogun'],['ON','Ondo'],['OS','Osun'],['OY','Oyo']]],
];

export const LAGOS_LGAS = ['Agege','Ajeromi-Ifelodun','Alimosho','Amuwo-Odofin','Apapa','Badagry','Epe','Eti-Osa',
  'Ibeju-Lekki','Ifako-Ijaiye','Ikeja','Ikorodu','Kosofe','Lagos Island','Lagos Mainland','Mushin','Ojo',
  'Oshodi-Isolo','Shomolu','Surulere'];

export const AU_STATES = [['NSW','New South Wales'],['VIC','Victoria'],['QLD','Queensland'],['WA','Western Australia'],
  ['SA','South Australia'],['TAS','Tasmania'],['ACT','Australian Capital Territory'],['NT','Northern Territory']];

export const UK_NATIONS = [
  ['ENG', 'England', ['North East','North West','Yorkshire and the Humber','East Midlands','West Midlands','East of England','London','South East','South West']],
  ['SCT', 'Scotland', ['Central Scotland','Glasgow','Highlands and Islands','Lothian','Mid Scotland and Fife','North East Scotland','South Scotland','West Scotland']],
  ['WLS', 'Wales', ['North Wales','Mid and West Wales','South Wales West','South Wales Central','South Wales East']],
  ['NIR', 'Northern Ireland', ['Northern Ireland']],
];

export const CA_PROVINCES = [['NL','Newfoundland and Labrador'],['PE','Prince Edward Island'],['NS','Nova Scotia'],['NB','New Brunswick'],
  ['QC','Quebec'],['ON','Ontario'],['MB','Manitoba'],['SK','Saskatchewan'],['AB','Alberta'],['BC','British Columbia'],
  ['YT','Yukon'],['NT','Northwest Territories'],['NU','Nunavut']];

