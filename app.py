"""보스턴 집값 예측 웹 서버 (Flask + SQLite + JSON 모델) - Vercel Serverless Ready"""
import json, sqlite3, os
import numpy as np
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MODEL_PATH = os.path.join(BASE_DIR, "model.json")
DB_PATH = os.path.join(BASE_DIR, "boston.db")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")

# 모델 로드 (절대 경로)
MODEL = json.load(open(MODEL_PATH, encoding="utf-8"))
FEATURES = MODEL["features"]

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.get("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.get("/api/model")
def model_info():
    return jsonify(features=FEATURES, ranges=MODEL["ranges"], metrics=MODEL["metrics"])

@app.post("/api/predict")
def predict():
    body = request.get_json(silent=True) or {}
    try:
        x = np.array([float(body[f]) for f in FEATURES])
    except (KeyError, TypeError, ValueError):
        return jsonify(error="13개 입력값을 모두 숫자로 보내주세요."), 400
    z = (x - np.array(MODEL["mean"])) / np.array(MODEL["std"])
    price = float(z @ np.array(MODEL["coef"]) + MODEL["intercept"])
    price = max(price, 0.0)
    
    # Vercel 서버리스 환경(Read-only 파일시스템) 고려한 DB 저장
    try:
        with db() as con:
            con.execute("INSERT INTO predictions (inputs, predicted) VALUES (?, ?)",
                        (json.dumps(body, ensure_ascii=False), price))
    except Exception:
        pass  # Vercel 읽기 전용 환경에서도 예측 응답은 정상 반환
        
    return jsonify(price=round(price, 2))

@app.get("/api/history")
def history():
    try:
        rows = db().execute(
            "SELECT id, created_at, predicted, inputs FROM predictions ORDER BY id DESC LIMIT 8").fetchall()
        return jsonify([{"id": r["id"], "created_at": r["created_at"],
                         "price": round(r["predicted"], 2),
                         "rm": json.loads(r["inputs"]).get("rm"),
                         "lstat": json.loads(r["inputs"]).get("lstat")} for r in rows])
    except Exception:
        return jsonify([])

@app.get("/api/stats")
def stats():
    con = db()
    total = con.execute("SELECT COUNT(*) c, ROUND(AVG(medv),1) a, ROUND(MIN(medv),1) min_p, ROUND(MAX(medv),1) max_p FROM houses").fetchone()
    
    # 방 개수별 평균
    by_rooms = con.execute("""SELECT CAST(ROUND(rm) AS INTEGER) rooms, ROUND(AVG(medv),1) avg_price, COUNT(*) count
                              FROM houses GROUP BY ROUND(rm) ORDER BY rooms""").fetchall()
    
    # 찰스강 인접 여부별 평균
    by_chas = con.execute("""SELECT chas, ROUND(AVG(medv),1) avg_price, COUNT(*) count 
                             FROM houses GROUP BY chas ORDER BY chas""").fetchall()
    
    # 가격대 구간별 분포
    dist = con.execute("""
        SELECT 
          CASE 
            WHEN medv < 15 THEN '$15k 미만 (저가대)'
            WHEN medv >= 15 AND medv < 25 THEN '$15k~$25k (중하위)'
            WHEN medv >= 25 AND medv < 35 THEN '$25k~$35k (중상위)'
            ELSE '$35k 이상 (고가대)'
          END AS bucket,
          COUNT(*) as cnt,
          ROUND(AVG(medv), 1) as avg_price
        FROM houses
        GROUP BY bucket
        ORDER BY MIN(medv)
    """).fetchall()

    return jsonify(
        count=total["c"], 
        avg=total["a"],
        min=total["min_p"],
        max=total["max_p"],
        by_rooms=[dict(r) for r in by_rooms],
        by_chas=[dict(r) for r in by_chas],
        distribution=[dict(r) for r in dist]
    )

if __name__ == "__main__":
    app.run(debug=True, port=5000)
