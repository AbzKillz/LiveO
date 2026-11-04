# LiveO

Internal property intelligence tool. Staff pick postcode districts on a map, filter live sale and rental listings with sliders, open any London address, and produce a free material information report built from open government data plus Propalt.

## What is in it

| Screen | What it does |
|---|---|
| Find listings (`/`) | Click districts on the map or type them. Slider filters for price or rent, beds, floor area, time on market, EPC and council tax band; chips for status, reductions, type, tenure, owner type, agent, HMO, retirement, accessibility. Extra filters Propalt does not offer: below our estimate by X%, price cut since listing by X%. Preview count before pulling records, save searches, sort six ways. |
| Map (`/explore`) | Title outlines, every address point, conservation areas, listed buildings, Article 4, TPOs, flood zones, monuments, green belt, brownfield, EA flood risk WMS. Click a point to open it. |
| Property (`/property/:uprn`) | Title outline, key facts, energy, connectivity, designations, flood, crime, planning history. |
| Report (`/property/:uprn/report`) | Material information pack (NTSELAT Parts A, B, C). Every line says where it came from and whether staff must check or fill it. Saves drafts, prints to PDF. |
| Usage (`/usage`) | Address coverage and Propalt calls (paid vs cache hits) per user. |

## Data sources

| Data | Source | Cost | How |
|---|---|---|---|
| Every address point | OS Open UPRN | Free, OGL, attribution | Bulk, `load:uprn` |
| Postcodes, councils, LSOA | ONS Postcode Directory, ONS boundaries | Free, OGL | Bulk, `load:onspd`, `load:boundaries` |
| District shapes for the picker | Built from ONSPD (Voronoi, dissolved by outcode) | Free | `scripts/build-districts.sql` |
| Address text, EPC facts | DLUHC EPC register | Free (account needed) | Bulk `load:epc`, API fallback |
| Sale history, tenure | HM Land Registry Price Paid | Free, OGL | Bulk, `load:pricepaid`, matched to UPRN via EPC |
| Title outlines | HM Land Registry INSPIRE Index Polygons | Free, attribution | Bulk per council, `load:inspire` |
| Designations, flood zones | planning.data.gov.uk | Free | Live, cached a week |
| Flood warnings, flood risk maps | Environment Agency | Free | Live |
| Broadband, mobile | Ofcom Connected Nations | Free (key) | Live; Propalt fallback |
| Crime | data.police.uk | Free | Live |
| Live listings, council tax band, title numbers, leases, coal, planning, valuation | Propalt | Paid per call | Live, every response cached in `api_cache` |

Never scrape portals. Every Propalt response is cached (property facts for 30 days, listings for an hour) and logged to `api_usage`.

### Known gaps

- No free dataset has every address as text. OS Open UPRN gives the points; EPC covers most homes that have been sold or let since 2008. Points without text get it from Propalt the first time someone opens them, then it is stored.
- Price Paid has no UPRN or coordinates, so it only links to points that matched an EPC.
- Council tax bands come from Propalt; there is no VOA bulk download.
- Propalt REST paths are inferred from the connector. If yours differ, set `PROPALT_PATHS` (JSON map of endpoint name to path) without changing code.

## Run locally

```bash
cp .env.example .env.local        # fill in values
docker compose up -d              # PostGIS on :5432
npm install
npm run db:migrate

# Sample data (a slice of Camden) to try it without downloads
S=fixtures/sample
npm run load:boundaries -- $S/boundaries.geojson
npm run load:onspd -- $S/onspd.csv
npm run load:uprn -- $S/uprn.csv
npm run load:epc -- $S/epc.csv
npm run load:pricepaid -- $S/pp.csv
npm run load:inspire -- $S/inspire.gml
psql "$DATABASE_URL" -f scripts/build-districts.sql

# No Propalt key yet? Use the mock that serves recorded responses
node scripts/mock-propalt.mjs     # then PROPALT_API_BASE=http://localhost:4010 PROPALT_API_KEY=dev

npm run dev
```

### Loading all of London

Download, then run the loaders in the order above (`LIVEO_REGION=london` is the default):

1. ONS Local Authority Districts boundaries (GeoJSON, BGC), from the ONS Open Geography Portal.
2. ONSPD latest CSV, from the ONS Open Geography Portal.
3. OS Open UPRN CSV, from the OS Data Hub (about 40M rows nationally; the loader keeps London only).
4. EPC domestic bulk download for the 33 London councils, from the EPC open data site.
5. Price Paid complete file, from HM Land Registry.
6. INSPIRE Index Polygons for the 33 London councils, from HM Land Registry.
7. `scripts/build-districts.sql`.

To widen beyond London set `LIVEO_REGION` to a comma separated list of local authority codes, or `all`.

## Deploy on Netlify

`netlify.toml` uses the Next.js adapter. Use an external Postgres with PostGIS (Neon or Supabase), run `db:migrate` and the loaders against it from your machine or CI, and set the env vars from `.env.example` in Netlify. Loaders must not run inside Netlify functions.

## Tests

```bash
npm test          # unit tests on filters, parsers and the report builder
npm run typecheck
```

## Attribution required in the UI

Contains OS data © Crown copyright and database right. Contains HM Land Registry data © Crown copyright and database right. Open Government Licence v3.0. Shown on every map.
