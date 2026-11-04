-- Match Price Paid rows to UPRNs through EPC addresses in the same postcode.
-- Normalised "saon paon street" must appear at the start of the EPC address.
CREATE OR REPLACE FUNCTION liveo_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

WITH epc AS (
  SELECT DISTINCT ON (uprn) uprn, postcode, liveo_norm(address) AS addr
  FROM epc_certificate WHERE uprn IS NOT NULL ORDER BY uprn, lodgement_date DESC
), candidates AS (
  SELECT pp.transaction_id, e.uprn,
         count(*) OVER (PARTITION BY pp.transaction_id) AS n
  FROM price_paid pp
  JOIN epc e ON e.postcode = pp.postcode
   AND e.addr LIKE liveo_norm(concat_ws(' ', pp.saon, pp.paon, pp.street)) || '%'
  WHERE pp.uprn IS NULL
)
UPDATE price_paid pp SET uprn = c.uprn
FROM candidates c WHERE c.transaction_id = pp.transaction_id AND c.n = 1;

-- Note: Price Paid has no coordinates or UPRN, so it can only be linked to points that already
-- matched an EPC. It adds sale history and tenure, not extra address coverage. Unmatched points
-- get their text from Propalt on demand (src/lib/property.ts enrichAddress).
