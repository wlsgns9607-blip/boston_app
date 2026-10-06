-- 앱에서 쓰는 SQL 모음 (참고용)
-- 평균 집값: 강변 접함(chas) 여부별
SELECT chas, ROUND(AVG(medv), 2) AS avg_price, COUNT(*) AS n FROM houses GROUP BY chas;
-- 방 개수(반올림)별 평균 집값
SELECT ROUND(rm) AS rooms, ROUND(AVG(medv), 2) AS avg_price, COUNT(*) AS n
FROM houses GROUP BY ROUND(rm) ORDER BY rooms;
-- 최근 예측 기록
SELECT id, created_at, predicted FROM predictions ORDER BY id DESC LIMIT 10;
