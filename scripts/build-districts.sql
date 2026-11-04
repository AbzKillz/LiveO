-- Build postcode district polygons from postcode centroids: a Voronoi cell per postcode,
-- clipped to the region boundary, then dissolved by outcode. Free (ONSPD, OGL) and close
-- enough to Royal Mail's own boundaries for picking districts on a map.
BEGIN;
TRUNCATE postcode_district;
WITH region AS (
  SELECT ST_Union(geom) AS geom FROM region_boundary
), pts AS (
  SELECT p.postcode, split_part(p.postcode, ' ', 1) AS outcode, p.la_code, ST_Transform(p.geom, 27700) AS g
  FROM postcode p, region r
  WHERE p.geom IS NOT NULL AND ST_Intersects(p.geom, r.geom)
), cells AS (
  SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(g)))).geom AS cell FROM pts
), owned AS (
  SELECT pts.outcode, pts.la_code, c.cell
  FROM cells c JOIN pts ON ST_Contains(c.cell, pts.g)
)
INSERT INTO postcode_district (outcode, la_codes, postcodes, geom, label_pt)
SELECT o.outcode,
       array_agg(DISTINCT o.la_code) FILTER (WHERE o.la_code IS NOT NULL),
       count(*),
       ST_Multi(ST_Intersection(ST_Transform(ST_Union(o.cell), 4326), (SELECT geom FROM region))),
       ST_PointOnSurface(ST_Transform(ST_Union(o.cell), 4326))
FROM owned o
GROUP BY o.outcode;
UPDATE postcode_district SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3));
COMMIT;
