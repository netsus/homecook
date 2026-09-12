-- R2 집계 기준: 운영자 확인으로 제외한 테스트 참여와 종속 event/lead는 집계하지 않는다.
-- 원본 행은 보존한다. raw table count는 분석 분모로 사용하지 않는다.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
WITH excluded AS (
  SELECT DISTINCT metadata_json->>'participation_id' AS id
  FROM public.operational_events
  WHERE event_type = 'marketing_test_exclusion'
    AND source = 'operator_confirmed_20260912'
    AND metadata_json->>'table' = 'marketing_round2_participations'
), participants AS (
  SELECT p.* FROM public.marketing_round2_participations p
  WHERE NOT EXISTS (SELECT 1 FROM excluded x WHERE x.id = p.id::text)
)
SELECT p.topic, count(*) AS participants,
  (SELECT count(*) FROM public.marketing_round2_events e
    JOIN participants v ON v.id = e.participation_id WHERE v.topic = p.topic) AS events,
  (SELECT count(*) FROM public.marketing_round2_lead_requests l
    JOIN participants v ON v.id = l.participation_id WHERE v.topic = p.topic) AS lead_requests
FROM participants p GROUP BY p.topic ORDER BY p.topic;
ROLLBACK;
