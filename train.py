"""CSV -> SQLite 적재 후, 선형회귀(릿지) 모델을 학습해 model.json 으로 저장합니다."""
import csv, json, sqlite3
import numpy as np

FEATURES = ["crim", "zn", "indus", "chas", "nox", "rm", "age",
            "dis", "rad", "tax", "ptratio", "b", "lstat"]

# 1) DB 만들기 + 데이터 적재
db = sqlite3.connect("boston.db")
db.executescript(open("schema.sql", encoding="utf-8").read())
with open("data/boston.csv", encoding="utf-8") as f:
    rows = [[float(r[c]) for c in FEATURES + ["medv"]] for r in csv.DictReader(f)]
cols = ",".join(FEATURES + ["medv"])
db.executemany(f"INSERT INTO houses ({cols}) VALUES ({','.join('?' * 14)})", rows)
db.commit()

# 2) DB에서 읽어 학습
data = np.array(db.execute(f"SELECT {cols} FROM houses").fetchall())
X, y = data[:, :-1], data[:, -1]
rng = np.random.default_rng(42)
idx = rng.permutation(len(X))
cut = int(len(X) * 0.8)
tr, te = idx[:cut], idx[cut:]

mean, std = X[tr].mean(0), X[tr].std(0)
def design(a): return np.hstack([(a - mean) / std, np.ones((len(a), 1))])

lam = 1.0
A = design(X[tr])
reg = lam * np.eye(A.shape[1]); reg[-1, -1] = 0       # 절편은 규제하지 않음
w = np.linalg.solve(A.T @ A + reg, A.T @ y[tr])

pred = design(X[te]) @ w
rmse = float(np.sqrt(np.mean((pred - y[te]) ** 2)))
r2 = float(1 - np.sum((pred - y[te]) ** 2) / np.sum((y[te] - y[te].mean()) ** 2))

# 3) JSON 저장 (입력 범위 정보 포함)
model = {
    "features": FEATURES,
    "mean": mean.tolist(), "std": std.tolist(),
    "coef": w[:-1].tolist(), "intercept": float(w[-1]),
    "metrics": {"r2": round(r2, 3), "rmse": round(rmse, 2), "n_train": int(cut), "n_test": int(len(te))},
    "ranges": {f: {"min": float(X[:, i].min()), "max": float(X[:, i].max()),
                   "median": float(np.median(X[:, i]))} for i, f in enumerate(FEATURES)},
}
json.dump(model, open("model.json", "w", encoding="utf-8"), indent=2)
print(f"houses={len(rows)}  R2={r2:.3f}  RMSE={rmse:.2f}  -> boston.db, model.json")
