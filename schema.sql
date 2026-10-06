-- 보스턴 집값 예측 DB 스키마 (SQLite)
DROP TABLE IF EXISTS houses;
CREATE TABLE houses (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    crim    REAL, zn REAL, indus REAL, chas INTEGER, nox REAL,
    rm      REAL, age REAL, dis REAL, rad REAL, tax REAL,
    ptratio REAL, b REAL, lstat REAL,
    medv    REAL            -- 실제 집값 (단위: 1,000달러)
);

CREATE TABLE IF NOT EXISTS predictions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    inputs     TEXT NOT NULL,   -- 입력값 JSON
    predicted  REAL NOT NULL    -- 예측 집값 (단위: 1,000달러)
);
