# 보스턴 집값 예측 웹사이트
```
pip install -r requirements.txt
python train.py   # CSV -> boston.db(SQLite) 적재 + 모델 학습 -> model.json
python app.py     # http://127.0.0.1:5000
```
- `schema.sql` / `queries.sql`: DB 테이블과 SQL
- `model.json`: 학습된 가중치·입력 범위·정확도
- `app.py`: Flask API (/api/predict, /api/history, /api/stats, /api/model)
- `static/`: index.html, style.css, app.js
